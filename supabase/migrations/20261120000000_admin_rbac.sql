-- ============================================================
-- ZCARE — ADMIN ROLES, ACCOUNT SUSPENSION, AUDIT LOG, ADMIN RPCs
-- ============================================================
-- Additive and safe to re-run. Reverse with supabase/rollbacks/20261120000000_admin_rbac.down.sql.
-- Does not modify any existing table, row, policy or the membership functions.
--
-- Design
--   * Roles live in public.app_admins (super_admin | admin). Regular users have no row.
--     The browser has NO privileges on it; roles are only read/changed through the
--     functions below, which check the caller's role from auth.uid() in the database.
--   * Exactly one super_admin (unique index). It can only be created by the bootstrap
--     function (SQL Editor / service role), and only moved with the transfer function.
--     A trigger blocks deleting/demoting the super_admin row any other way.
--   * Suspension: public.account_status. A RESTRICTIVE policy on every user-data table
--     (and the two storage buckets) denies all access to suspended accounts.
--   * Patient privacy: admins get NO policy on medical tables. Admin functions never
--     read medications, allergies, consultations, documents, lab results, reminders or
--     insurance. They see account, profile name/language and membership data only.
--   * Every admin write (and viewing a user's detail) is written to an append-only
--     audit log. No passwords, tokens or medical content are logged.
--   * Admins cannot activate paid subscriptions (that stays service-role +
--     verified payment only, via activate_subscription()).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tables
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_admins (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('super_admin', 'admin')),
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_app_admins_one_super_admin ON public.app_admins ((role)) WHERE role = 'super_admin';

CREATE TABLE IF NOT EXISTS public.account_status (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL CHECK (status IN ('active', 'suspended')),
  reason     TEXT CHECK (reason IS NULL OR length(reason) <= 500),
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id    UUID,                      -- NULL = trusted system/SQL procedure
  actor_email TEXT,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON public.admin_audit_log (created_at DESC);

ALTER TABLE public.app_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: browser roles can never read or write these tables directly.
REVOKE ALL ON public.app_admins, public.account_status, public.admin_audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.app_admins, public.account_status, public.admin_audit_log TO service_role;

-- ------------------------------------------------------------
-- 2. Guards (triggers)
-- ------------------------------------------------------------
-- The super_admin row can only be removed/changed inside zc_transfer_super_admin().
CREATE OR REPLACE FUNCTION public.zc_guard_super_admin()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.role = 'super_admin' AND pg_catalog.current_setting('zcare.super_admin_change', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'super_admin_protected: use zc_transfer_super_admin() to change the Super Admin' USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
DROP TRIGGER IF EXISTS trg_guard_super_admin ON public.app_admins;
CREATE TRIGGER trg_guard_super_admin BEFORE UPDATE OR DELETE ON public.app_admins
  FOR EACH ROW EXECUTE FUNCTION public.zc_guard_super_admin();

-- The audit log is append-only.
CREATE OR REPLACE FUNCTION public.zc_guard_audit_log()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_log is append-only' USING ERRCODE = '42501';
END $$;
DROP TRIGGER IF EXISTS trg_guard_audit_log ON public.admin_audit_log;
CREATE TRIGGER trg_guard_audit_log BEFORE UPDATE OR DELETE ON public.admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.zc_guard_audit_log();

-- ------------------------------------------------------------
-- 3. Internal helpers (not callable from the browser)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.zc_admin_role_of(p_user UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT a.role FROM public.app_admins a WHERE a.user_id = p_user;
$$;

CREATE OR REPLACE FUNCTION public.zc_is_suspended(p_user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.account_status s WHERE s.user_id = p_user AND s.status = 'suspended');
$$;

CREATE OR REPLACE FUNCTION public.zc_audit(p_actor UUID, p_action TEXT, p_target_type TEXT, p_target_id TEXT, p_metadata JSONB)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.admin_audit_log (actor_id, actor_email, action, target_type, target_id, metadata)
  VALUES (p_actor, (SELECT u.email FROM auth.users u WHERE u.id = p_actor), p_action, p_target_type, p_target_id, COALESCE(p_metadata, '{}'::jsonb));
$$;

/** Returns the caller's id if they are an active admin (or super admin when p_super). Raises otherwise. */
CREATE OR REPLACE FUNCTION public.zc_require_admin(p_super BOOLEAN)
RETURNS UUID LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  v_role := public.zc_admin_role_of(v_uid);
  IF v_role IS NULL OR (p_super AND v_role <> 'super_admin') OR public.zc_is_suspended(v_uid) THEN
    RAISE EXCEPTION '%', CASE WHEN p_super THEN 'super_admin_required' ELSE 'admin_required' END USING ERRCODE = '42501';
  END IF;
  RETURN v_uid;
END $$;

-- ------------------------------------------------------------
-- 4. Functions the app calls for the signed-in user
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.zc_my_admin_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN public.zc_is_suspended(auth.uid()) THEN NULL ELSE public.zc_admin_role_of(auth.uid()) END;
$$;

CREATE OR REPLACE FUNCTION public.zc_my_account_status()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN public.zc_is_suspended(auth.uid()) THEN 'suspended' ELSE 'active' END;
$$;

/** Used inside RLS policies. */
CREATE OR REPLACE FUNCTION public.zc_is_active_user()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT NOT public.zc_is_suspended(auth.uid());
$$;

-- ------------------------------------------------------------
-- 5. Suspension enforcement (RESTRICTIVE: only ever narrows access)
-- ------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles', 'medications', 'allergies', 'insurance_policies', 'insurance_members', 'consultations',
                           'medical_documents', 'reminders', 'subscriptions', 'lab_results', 'document_extractions', 'medical_record_sources']
  LOOP
    EXECUTE pg_catalog.format('DROP POLICY IF EXISTS zc_account_active ON public.%I', t);
    EXECUTE pg_catalog.format(
      'CREATE POLICY zc_account_active ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.zc_is_active_user())) WITH CHECK ((SELECT public.zc_is_active_user()))', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS zc_account_active_storage ON storage.objects;
CREATE POLICY zc_account_active_storage ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
  USING (bucket_id NOT IN ('medical-documents', 'profile-photos') OR (SELECT public.zc_is_active_user()))
  WITH CHECK (bucket_id NOT IN ('medical-documents', 'profile-photos') OR (SELECT public.zc_is_active_user()));

-- ------------------------------------------------------------
-- 6. Admin dashboard functions (admins only; checked in the database)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_overview()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_now TIMESTAMPTZ := pg_catalog.now();
  v_result JSONB;
BEGIN
  PERFORM public.zc_require_admin(false);
  SELECT pg_catalog.jsonb_build_object(
    'total_users',      (SELECT pg_catalog.count(*) FROM auth.users),
    'active_users_30d', (SELECT pg_catalog.count(*) FROM auth.users u WHERE u.last_sign_in_at > v_now - INTERVAL '30 days'),
    'suspended_users',  (SELECT pg_catalog.count(*) FROM public.account_status s WHERE s.status = 'suspended'),
    'active_trials',    (SELECT pg_catalog.count(*) FROM public.subscriptions s WHERE s.plan = 'trial' AND s.status = 'trial' AND s.period_end > v_now),
    'active_monthly',   (SELECT pg_catalog.count(*) FROM public.subscriptions s WHERE s.plan = 'monthly' AND s.status = 'active' AND s.period_end > v_now),
    'active_yearly',    (SELECT pg_catalog.count(*) FROM public.subscriptions s WHERE s.plan = 'yearly' AND s.status = 'active' AND s.period_end > v_now),
    'pending_requests', (SELECT pg_catalog.count(*) FROM public.subscriptions s WHERE s.status = 'pending'),
    'expired',          (SELECT pg_catalog.count(*) FROM public.subscriptions s WHERE s.status = 'expired' OR (s.status IN ('active', 'trial') AND s.period_end <= v_now)),
    'admins',           (SELECT pg_catalog.count(*) FROM public.app_admins),
    'recent_activity',  COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', l.id, 'actor_email', l.actor_email, 'action', l.action,
               'target_type', l.target_type, 'target_id', l.target_id, 'metadata', l.metadata, 'created_at', l.created_at) ORDER BY l.created_at DESC)
      FROM (SELECT * FROM public.admin_audit_log ORDER BY created_at DESC LIMIT 10) l), '[]'::jsonb),
    'generated_at',     v_now
  ) INTO v_result;
  RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_users(p_search TEXT DEFAULT NULL, p_status TEXT DEFAULT NULL, p_limit INTEGER DEFAULT 50, p_offset INTEGER DEFAULT 0)
RETURNS TABLE (
  user_id UUID, email TEXT, full_name TEXT, created_at TIMESTAMPTZ, last_sign_in_at TIMESTAMPTZ, email_confirmed BOOLEAN,
  account_status TEXT, admin_role TEXT, membership_plan TEXT, membership_status TEXT, membership_end TIMESTAMPTZ, total_count BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_column
DECLARE
  v_search TEXT := NULLIF(pg_catalog.lower(pg_catalog.btrim(COALESCE(p_search, ''))), '');
BEGIN
  PERFORM public.zc_require_admin(false);
  IF p_status IS NOT NULL AND p_status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'invalid_filter' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  WITH base AS (
    SELECT u.id, u.email::TEXT AS email, p.full_name, u.created_at, u.last_sign_in_at, (u.email_confirmed_at IS NOT NULL) AS confirmed,
           CASE WHEN st.status = 'suspended' THEN 'suspended' ELSE 'active' END AS acct,
           a.role
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.user_id = u.id
    LEFT JOIN public.account_status st ON st.user_id = u.id
    LEFT JOIN public.app_admins a ON a.user_id = u.id
    WHERE (v_search IS NULL OR pg_catalog.strpos(pg_catalog.lower(COALESCE(u.email, '')), v_search) > 0
                            OR pg_catalog.strpos(pg_catalog.lower(COALESCE(p.full_name, '')), v_search) > 0)
      AND (p_status IS NULL OR (CASE WHEN st.status = 'suspended' THEN 'suspended' ELSE 'active' END) = p_status)
  )
  SELECT b.id, b.email, b.full_name, b.created_at, b.last_sign_in_at, b.confirmed, b.acct, b.role,
         m.plan, m.eff_status, m.period_end, pg_catalog.count(*) OVER ()
  FROM base b
  LEFT JOIN LATERAL (
    SELECT s.plan,
           CASE WHEN s.status IN ('active', 'trial') AND s.period_end <= pg_catalog.now() THEN 'expired' ELSE s.status END AS eff_status,
           s.period_end
    FROM public.subscriptions s
    WHERE s.user_id = b.id
    ORDER BY (s.status IN ('active', 'trial') AND s.period_end > pg_catalog.now()) DESC, (s.status = 'active') DESC, s.created_at DESC
    LIMIT 1
  ) m ON true
  ORDER BY b.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200)) OFFSET GREATEST(0, COALESCE(p_offset, 0));
END $$;

CREATE OR REPLACE FUNCTION public.admin_get_user(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_admin UUID := public.zc_require_admin(false);
  v_result JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0002';
  END IF;
  -- Account + basic profile + membership only. No medical data.
  SELECT pg_catalog.jsonb_build_object(
    'user_id', u.id, 'email', u.email, 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at,
    'email_confirmed', u.email_confirmed_at IS NOT NULL,
    'providers', COALESCE((SELECT pg_catalog.jsonb_agg(DISTINCT i.provider) FROM auth.identities i WHERE i.user_id = u.id), '[]'::jsonb),
    'full_name', p.full_name, 'language', p.language, 'profile_created_at', p.created_at,
    'account_status', CASE WHEN st.status = 'suspended' THEN 'suspended' ELSE 'active' END,
    'status_reason', st.reason, 'status_changed_at', st.changed_at,
    'admin_role', a.role,
    'subscriptions', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', s.id, 'plan', s.plan, 'status', s.status,
               'effective_status', CASE WHEN s.status IN ('active', 'trial') AND s.period_end <= pg_catalog.now() THEN 'expired' ELSE s.status END,
               'amount', s.amount, 'currency', s.currency, 'provider_reference', s.provider_reference,
               'period_start', s.period_start, 'period_end', s.period_end, 'created_at', s.created_at) ORDER BY s.created_at DESC)
      FROM public.subscriptions s WHERE s.user_id = u.id), '[]'::jsonb)
  ) INTO v_result
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.user_id = u.id
  LEFT JOIN public.account_status st ON st.user_id = u.id
  LEFT JOIN public.app_admins a ON a.user_id = u.id
  WHERE u.id = p_user_id;

  PERFORM public.zc_audit(v_admin, 'user.viewed', 'user', p_user_id::TEXT, '{}'::jsonb);
  RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_account_status(p_user_id UUID, p_status TEXT, p_reason TEXT DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_admin UUID := public.zc_require_admin(false);
  v_target_role TEXT;
  v_reason TEXT := NULLIF(pg_catalog.btrim(COALESCE(p_reason, '')), '');
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF p_user_id = v_admin THEN
    RAISE EXCEPTION 'cannot_change_own_status' USING ERRCODE = '42501';
  END IF;
  v_target_role := public.zc_admin_role_of(p_user_id);
  IF v_target_role = 'super_admin' THEN
    RAISE EXCEPTION 'cannot_change_super_admin' USING ERRCODE = '42501';
  END IF;
  IF v_target_role = 'admin' AND public.zc_admin_role_of(v_admin) <> 'super_admin' THEN
    RAISE EXCEPTION 'super_admin_required' USING ERRCODE = '42501';
  END IF;
  IF p_status = 'suspended' AND v_reason IS NULL THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NOT NULL AND pg_catalog.length(v_reason) > 500 THEN
    RAISE EXCEPTION 'reason_too_long' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.account_status (user_id, status, reason, changed_by, changed_at)
  VALUES (p_user_id, p_status, v_reason, v_admin, pg_catalog.now())
  ON CONFLICT (user_id) DO UPDATE SET status = EXCLUDED.status, reason = EXCLUDED.reason, changed_by = EXCLUDED.changed_by, changed_at = EXCLUDED.changed_at;

  PERFORM public.zc_audit(v_admin, CASE WHEN p_status = 'suspended' THEN 'user.deactivated' ELSE 'user.reactivated' END,
                          'user', p_user_id::TEXT, pg_catalog.jsonb_build_object('reason', v_reason));
  RETURN p_status;
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_subscriptions(p_filter TEXT DEFAULT 'all', p_search TEXT DEFAULT NULL, p_limit INTEGER DEFAULT 50, p_offset INTEGER DEFAULT 0)
RETURNS TABLE (
  id UUID, user_id UUID, email TEXT, plan TEXT, status TEXT, effective_status TEXT, amount NUMERIC, currency TEXT,
  provider_reference TEXT, period_start TIMESTAMPTZ, period_end TIMESTAMPTZ, created_at TIMESTAMPTZ, total_count BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_column
DECLARE
  v_filter TEXT := COALESCE(p_filter, 'all');
  v_search TEXT := NULLIF(pg_catalog.lower(pg_catalog.btrim(COALESCE(p_search, ''))), '');
BEGIN
  PERFORM public.zc_require_admin(false);
  IF v_filter NOT IN ('all', 'trial', 'monthly', 'yearly', 'active', 'pending', 'expired') THEN
    RAISE EXCEPTION 'invalid_filter' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  WITH subs AS (
    SELECT s.id, s.user_id, u.email::TEXT AS email, s.plan, s.status,
           CASE WHEN s.status IN ('active', 'trial') AND s.period_end <= pg_catalog.now() THEN 'expired' ELSE s.status END AS eff,
           s.amount, s.currency, s.provider_reference, s.period_start, s.period_end, s.created_at
    FROM public.subscriptions s
    LEFT JOIN auth.users u ON u.id = s.user_id
  )
  SELECT r.id, r.user_id, r.email, r.plan, r.status, r.eff, r.amount, r.currency, r.provider_reference,
         r.period_start, r.period_end, r.created_at, pg_catalog.count(*) OVER ()
  FROM subs r
  WHERE (v_filter = 'all'
         OR (v_filter IN ('trial', 'monthly', 'yearly') AND r.plan = v_filter)
         OR (v_filter = 'active' AND r.eff IN ('active', 'trial'))
         OR (v_filter = 'pending' AND r.eff = 'pending')
         OR (v_filter = 'expired' AND r.eff = 'expired'))
    AND (v_search IS NULL OR pg_catalog.strpos(pg_catalog.lower(COALESCE(r.email, '')), v_search) > 0
                          OR pg_catalog.strpos(pg_catalog.lower(COALESCE(r.provider_reference, '')), v_search) > 0)
  ORDER BY r.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200)) OFFSET GREATEST(0, COALESCE(p_offset, 0));
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_admins()
RETURNS TABLE (user_id UUID, email TEXT, role TEXT, granted_at TIMESTAMPTZ, granted_by_email TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_column
BEGIN
  PERFORM public.zc_require_admin(false);
  RETURN QUERY
  SELECT a.user_id, u.email::TEXT, a.role, a.granted_at, g.email::TEXT
  FROM public.app_admins a
  JOIN auth.users u ON u.id = a.user_id
  LEFT JOIN auth.users g ON g.id = a.granted_by
  ORDER BY (a.role = 'super_admin') DESC, a.granted_at;
END $$;

CREATE OR REPLACE FUNCTION public.admin_grant_admin(p_email TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_admin UUID := public.zc_require_admin(true);
  v_target UUID;
BEGIN
  SELECT u.id INTO v_target FROM auth.users u WHERE pg_catalog.lower(u.email) = pg_catalog.lower(pg_catalog.btrim(COALESCE(p_email, '')));
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM public.app_admins a WHERE a.user_id = v_target) THEN
    RAISE EXCEPTION 'already_admin' USING ERRCODE = 'P0001';
  END IF;
  IF public.zc_is_suspended(v_target) THEN
    RAISE EXCEPTION 'account_suspended' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.app_admins (user_id, role, granted_by) VALUES (v_target, 'admin', v_admin);
  PERFORM public.zc_audit(v_admin, 'role.granted', 'user', v_target::TEXT, pg_catalog.jsonb_build_object('role', 'admin'));
  RETURN v_target;
END $$;

CREATE OR REPLACE FUNCTION public.admin_revoke_admin(p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_admin UUID := public.zc_require_admin(true);
  v_role TEXT := public.zc_admin_role_of(p_user_id);
BEGIN
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'not_an_admin' USING ERRCODE = 'P0002';
  END IF;
  IF v_role = 'super_admin' THEN
    RAISE EXCEPTION 'cannot_change_super_admin' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.app_admins a WHERE a.user_id = p_user_id;
  PERFORM public.zc_audit(v_admin, 'role.revoked', 'user', p_user_id::TEXT, pg_catalog.jsonb_build_object('role', v_role));
END $$;

CREATE OR REPLACE FUNCTION public.admin_audit_log(p_limit INTEGER DEFAULT 50, p_offset INTEGER DEFAULT 0, p_action TEXT DEFAULT NULL)
RETURNS TABLE (id BIGINT, actor_email TEXT, action TEXT, target_type TEXT, target_id TEXT, target_email TEXT, metadata JSONB, created_at TIMESTAMPTZ, total_count BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_column
BEGIN
  PERFORM public.zc_require_admin(false);
  RETURN QUERY
  SELECT l.id, l.actor_email, l.action, l.target_type, l.target_id,
         (SELECT u.email::TEXT FROM auth.users u WHERE l.target_type = 'user' AND u.id::TEXT = l.target_id),
         l.metadata, l.created_at, pg_catalog.count(*) OVER ()
  FROM public.admin_audit_log l
  WHERE p_action IS NULL OR l.action = p_action
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200)) OFFSET GREATEST(0, COALESCE(p_offset, 0));
END $$;

/** System: read-only plan catalogue and housekeeping state. */
CREATE OR REPLACE FUNCTION public.admin_system_info()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.zc_require_admin(false);
  RETURN pg_catalog.jsonb_build_object(
    'plans', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('plan', p, 'amount', t.amount, 'duration', t.duration::TEXT) ORDER BY o)
              FROM (VALUES ('trial', 1), ('monthly', 2), ('yearly', 3)) v(p, o), LATERAL public.zc_plan_terms(p) t),
    'lapsed_not_marked', (SELECT pg_catalog.count(*) FROM public.subscriptions s WHERE s.status IN ('active', 'trial') AND s.period_end <= pg_catalog.now()),
    'last_housekeeping', (SELECT pg_catalog.max(l.created_at) FROM public.admin_audit_log l WHERE l.action = 'system.expire_lapsed')
  );
END $$;

/** System: mark lapsed subscriptions as expired (access already ends at period_end). Super Admin only. */
CREATE OR REPLACE FUNCTION public.admin_expire_lapsed_subscriptions()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_admin UUID := public.zc_require_admin(true);
  v_count INTEGER;
BEGIN
  WITH changed AS (
    UPDATE public.subscriptions s SET status = 'expired'
    WHERE s.status IN ('active', 'trial') AND s.period_end <= pg_catalog.now()
    RETURNING 1
  )
  SELECT pg_catalog.count(*)::INTEGER INTO v_count FROM changed;
  PERFORM public.zc_audit(v_admin, 'system.expire_lapsed', 'system', NULL, pg_catalog.jsonb_build_object('rows', v_count));
  RETURN v_count;
END $$;

-- ------------------------------------------------------------
-- 7. Trusted procedures (SQL Editor / service role only — never the browser)
-- ------------------------------------------------------------
/** One-time: make an existing, email-confirmed account the Super Admin. */
CREATE OR REPLACE FUNCTION public.zc_bootstrap_super_admin(p_email TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_target UUID;
  v_confirmed BOOLEAN;
BEGIN
  IF EXISTS (SELECT 1 FROM public.app_admins a WHERE a.role = 'super_admin') THEN
    RAISE EXCEPTION 'super_admin_exists: use zc_transfer_super_admin() instead' USING ERRCODE = 'P0001';
  END IF;
  SELECT u.id, u.email_confirmed_at IS NOT NULL INTO v_target, v_confirmed
  FROM auth.users u WHERE pg_catalog.lower(u.email) = pg_catalog.lower(pg_catalog.btrim(COALESCE(p_email, '')));
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'user_not_found: the account must sign up (or be created in Authentication > Users) first' USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_confirmed THEN
    RAISE EXCEPTION 'email_not_confirmed' USING ERRCODE = 'P0001';
  END IF;
  IF public.zc_is_suspended(v_target) THEN
    RAISE EXCEPTION 'account_suspended' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.app_admins (user_id, role, granted_by) VALUES (v_target, 'super_admin', NULL)
  ON CONFLICT (user_id) DO NOTHING;
  IF NOT FOUND THEN
    -- Was an admin: promote (allowed: an 'admin' row is not protected).
    UPDATE public.app_admins SET role = 'super_admin', granted_by = NULL, granted_at = pg_catalog.now() WHERE user_id = v_target;
  END IF;
  PERFORM public.zc_audit(NULL, 'role.super_admin_bootstrapped', 'user', v_target::TEXT, '{}'::jsonb);
  RETURN v_target;
END $$;

/** Move the Super Admin role to another confirmed account. The old one becomes an admin, or loses access. */
CREATE OR REPLACE FUNCTION public.zc_transfer_super_admin(p_new_email TEXT, p_keep_old_as_admin BOOLEAN DEFAULT false)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_old UUID;
  v_new UUID;
  v_confirmed BOOLEAN;
BEGIN
  SELECT a.user_id INTO v_old FROM public.app_admins a WHERE a.role = 'super_admin';
  SELECT u.id, u.email_confirmed_at IS NOT NULL INTO v_new, v_confirmed
  FROM auth.users u WHERE pg_catalog.lower(u.email) = pg_catalog.lower(pg_catalog.btrim(COALESCE(p_new_email, '')));
  IF v_new IS NULL THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_confirmed THEN
    RAISE EXCEPTION 'email_not_confirmed' USING ERRCODE = 'P0001';
  END IF;
  IF v_new = v_old THEN
    RAISE EXCEPTION 'already_super_admin' USING ERRCODE = 'P0001';
  END IF;
  IF public.zc_is_suspended(v_new) THEN
    RAISE EXCEPTION 'account_suspended' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_catalog.set_config('zcare.super_admin_change', 'on', true);
  IF v_old IS NOT NULL THEN
    IF p_keep_old_as_admin THEN
      UPDATE public.app_admins SET role = 'admin', granted_by = v_new, granted_at = pg_catalog.now() WHERE user_id = v_old;
    ELSE
      DELETE FROM public.app_admins WHERE user_id = v_old;
    END IF;
  END IF;
  INSERT INTO public.app_admins (user_id, role, granted_by) VALUES (v_new, 'super_admin', NULL)
  ON CONFLICT (user_id) DO UPDATE SET role = 'super_admin', granted_by = NULL, granted_at = pg_catalog.now();
  PERFORM pg_catalog.set_config('zcare.super_admin_change', 'off', true);

  PERFORM public.zc_audit(NULL, 'role.super_admin_transferred', 'user', v_new::TEXT,
                          pg_catalog.jsonb_build_object('previous', v_old, 'previous_kept_as_admin', p_keep_old_as_admin));
  RETURN v_new;
END $$;

-- ------------------------------------------------------------
-- 8. Function privileges
-- ------------------------------------------------------------
DO $$
DECLARE
  f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.zc_guard_super_admin()', 'public.zc_guard_audit_log()',
    'public.zc_admin_role_of(uuid)', 'public.zc_is_suspended(uuid)', 'public.zc_audit(uuid, text, text, text, jsonb)',
    'public.zc_require_admin(boolean)', 'public.zc_my_admin_role()', 'public.zc_my_account_status()', 'public.zc_is_active_user()',
    'public.admin_overview()', 'public.admin_list_users(text, text, integer, integer)', 'public.admin_get_user(uuid)',
    'public.admin_set_account_status(uuid, text, text)', 'public.admin_list_subscriptions(text, text, integer, integer)',
    'public.admin_list_admins()', 'public.admin_grant_admin(text)', 'public.admin_revoke_admin(uuid)',
    'public.admin_audit_log(integer, integer, text)', 'public.admin_system_info()', 'public.admin_expire_lapsed_subscriptions()',
    'public.zc_bootstrap_super_admin(text)', 'public.zc_transfer_super_admin(text, boolean)']
  LOOP
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
  -- Signed-in users: their own role/status, and the RLS helper. Admin functions check the role themselves.
  FOREACH f IN ARRAY ARRAY[
    'public.zc_my_admin_role()', 'public.zc_my_account_status()', 'public.zc_is_active_user()',
    'public.admin_overview()', 'public.admin_list_users(text, text, integer, integer)', 'public.admin_get_user(uuid)',
    'public.admin_set_account_status(uuid, text, text)', 'public.admin_list_subscriptions(text, text, integer, integer)',
    'public.admin_list_admins()', 'public.admin_grant_admin(text)', 'public.admin_revoke_admin(uuid)',
    'public.admin_audit_log(integer, integer, text)', 'public.admin_system_info()', 'public.admin_expire_lapsed_subscriptions()']
  LOOP
    EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
-- zc_bootstrap_super_admin / zc_transfer_super_admin: no grants. Run them in the SQL Editor (as postgres).
