-- ============================================================
-- ZCARE — MEMBERSHIP PLANS: Free Trial (1 day), Monthly ₹199, Yearly ₹1,299
-- ============================================================
-- Additive and safe to re-run. Existing subscription rows are NEVER modified
-- by this migration (only by the functions below, at runtime).
--
--   1. zc_plan_terms(plan)          single source of truth for price + duration
--   2. Indexes                      one trial per user (ever); one active per user;
--                                   one use per payment reference
--   3. start_free_trial()           browser RPC: 24 h trial for the signed-in user
--   4. request_subscription(plan)   browser RPC: PENDING paid request at the server price
--   5. activate_subscription(...)   service_role ONLY, after server-side payment verification
--   6. get_my_access()              browser RPC: current premium access
--   7. expire_lapsed_subscriptions() service_role ONLY housekeeping (optional cron)
--   8. Privileges                   browser: SELECT only (RLS-limited); no direct writes
--
-- Security notes
--   * Identity always comes from auth.uid(); no function accepts a user id.
--   * Functions run with search_path = '' and fully qualified names, so objects
--     in other schemas (or a caller's temp schema) can't be substituted.
--   * SECURITY DEFINER is used only where the browser must create a row it may
--     not write directly (start_free_trial, request_subscription). Server-only
--     functions are SECURITY INVOKER: they rely on service_role's own rights.
--   * Per-user transaction advisory locks serialise all subscription changes of
--     one user, so simultaneous requests/activations cannot race.
--   * Calendar periods use PostgreSQL interval arithmetic in UTC:
--     2027-01-31 + 1 month = 2027-02-28; 2028-02-29 + 1 year = 2029-02-28.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Plan catalogue (prices in INR)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.zc_plan_terms(p_plan TEXT)
RETURNS TABLE (amount NUMERIC, duration INTERVAL)
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT t.amount, t.duration
  FROM (VALUES
    ('trial',   0::NUMERIC,    INTERVAL '24 hours'),
    ('monthly', 199::NUMERIC,  INTERVAL '1 month'),
    ('yearly',  1299::NUMERIC, INTERVAL '1 year')
  ) AS t(plan, amount, duration)
  WHERE t.plan = p_plan;
$$;

-- ------------------------------------------------------------
-- 2. Indexes (checked against existing data first; existing rows untouched)
-- ------------------------------------------------------------
DO $$
BEGIN
  -- One trial per user, ever.
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_subscriptions_one_trial_per_user') THEN
    IF EXISTS (SELECT 1 FROM public.subscriptions WHERE plan = 'trial' GROUP BY user_id HAVING count(*) > 1) THEN
      RAISE EXCEPTION 'Cannot add uq_subscriptions_one_trial_per_user: some users already have several trial rows. Resolve them first (see docs/MEMBERSHIP_PLANS.md).';
    END IF;
    CREATE UNIQUE INDEX uq_subscriptions_one_trial_per_user ON public.subscriptions(user_id) WHERE plan = 'trial';
  END IF;

  -- One active subscription per user (normally created by 20261111000000_security_hardening.sql).
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_subscriptions_one_active_per_user') THEN
    IF EXISTS (SELECT 1 FROM public.subscriptions WHERE status = 'active' GROUP BY user_id HAVING count(*) > 1) THEN
      RAISE EXCEPTION 'Cannot add uq_subscriptions_one_active_per_user: some users already have several active rows. Resolve them first.';
    END IF;
    CREATE UNIQUE INDEX uq_subscriptions_one_active_per_user ON public.subscriptions(user_id) WHERE status = 'active';
  END IF;

  -- A payment reference can activate only one subscription. Skipped (with a notice)
  -- if old data already reuses a reference; activate_subscription() checks it anyway.
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_subscriptions_provider_reference') THEN
    IF EXISTS (SELECT 1 FROM public.subscriptions WHERE provider_reference IS NOT NULL GROUP BY provider_reference HAVING count(*) > 1) THEN
      RAISE NOTICE 'uq_subscriptions_provider_reference not created: existing rows share a provider_reference.';
    ELSE
      CREATE UNIQUE INDEX uq_subscriptions_provider_reference ON public.subscriptions(provider_reference) WHERE provider_reference IS NOT NULL;
    END IF;
  END IF;
END $$;

-- ------------------------------------------------------------
-- Per-user lock used by every function that changes a user's subscriptions.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.zc_lock_user_subscriptions(p_user_id UUID)
RETURNS VOID
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('zcare.subscriptions:' || p_user_id::text, 0));
$$;

-- ------------------------------------------------------------
-- 3. Start the free trial
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_free_trial()
RETURNS public.subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_amount NUMERIC;
  v_duration INTERVAL;
  v_row public.subscriptions;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  PERFORM public.zc_lock_user_subscriptions(v_uid);

  IF EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.user_id = v_uid AND s.plan = 'trial') THEN
    RAISE EXCEPTION 'trial_already_used' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.user_id = v_uid AND s.status = 'active' AND s.period_end > pg_catalog.now()) THEN
    RAISE EXCEPTION 'already_subscribed' USING ERRCODE = 'P0001';
  END IF;

  SELECT t.amount, t.duration INTO v_amount, v_duration FROM public.zc_plan_terms('trial') t;
  BEGIN
    INSERT INTO public.subscriptions (user_id, plan, status, amount, currency, period_start, period_end)
    VALUES (v_uid, 'trial', 'trial', v_amount, 'INR', pg_catalog.now(), pg_catalog.now() + v_duration)
    RETURNING * INTO v_row;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'trial_already_used' USING ERRCODE = 'P0001'; -- backstop: one-trial index
  END;
  RETURN v_row;
END;
$$;

-- ------------------------------------------------------------
-- 4. Request a paid plan (pending until payment is verified)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_subscription(p_plan TEXT)
RETURNS public.subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_amount NUMERIC;
  v_duration INTERVAL;
  v_row public.subscriptions;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  -- NULL must be rejected explicitly ("NULL NOT IN (...)" is NULL, not TRUE).
  IF p_plan IS NULL OR p_plan NOT IN ('monthly', 'yearly') THEN
    RAISE EXCEPTION 'invalid_plan' USING ERRCODE = '22023';
  END IF;

  -- Serialise this user's requests: simultaneous calls return the same pending row.
  PERFORM public.zc_lock_user_subscriptions(v_uid);

  SELECT * INTO v_row FROM public.subscriptions s
  WHERE s.user_id = v_uid AND s.plan = p_plan AND s.status = 'pending'
  ORDER BY s.created_at DESC
  LIMIT 1;
  IF FOUND THEN
    RETURN v_row;
  END IF;

  SELECT t.amount, t.duration INTO v_amount, v_duration FROM public.zc_plan_terms(p_plan) t;
  -- period_* are provisional; activate_subscription() sets the real period at payment time.
  INSERT INTO public.subscriptions (user_id, plan, status, amount, currency, period_start, period_end)
  VALUES (v_uid, p_plan, 'pending', v_amount, 'INR', pg_catalog.now(), pg_catalog.now() + v_duration)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- ------------------------------------------------------------
-- 5. Activate after VERIFIED payment (service_role only)
-- ------------------------------------------------------------
-- The caller (a Supabase Edge Function / webhook using the service-role key)
-- MUST first verify the payment with the gateway (e.g. Razorpay signature
-- check and payment status = captured). This function then enforces:
--   * the row is pending and its plan is a paid plan,
--   * the amount actually paid equals the server price, in INR,
--   * the payment reference is present and not used for another subscription,
--   * one change at a time per user (advisory lock + row lock).
-- Re-delivery of the same webhook (same subscription + same reference) is
-- idempotent and returns the already-active row.
CREATE OR REPLACE FUNCTION public.activate_subscription(
  p_subscription_id UUID,
  p_provider_reference TEXT,
  p_amount_paid NUMERIC,
  p_currency TEXT DEFAULT 'INR'
)
RETURNS public.subscriptions
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user UUID;
  v_sub public.subscriptions;
  v_amount NUMERIC;
  v_duration INTERVAL;
  v_start TIMESTAMPTZ;
BEGIN
  IF p_subscription_id IS NULL THEN
    RAISE EXCEPTION 'subscription_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF p_provider_reference IS NULL OR pg_catalog.length(pg_catalog.btrim(p_provider_reference)) = 0 THEN
    RAISE EXCEPTION 'missing_payment_reference' USING ERRCODE = '22023';
  END IF;
  IF p_currency IS DISTINCT FROM 'INR' THEN
    RAISE EXCEPTION 'currency_mismatch' USING ERRCODE = 'P0001';
  END IF;

  SELECT s.user_id INTO v_user FROM public.subscriptions s WHERE s.id = p_subscription_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'subscription_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- One activation at a time per user, then lock the row itself.
  PERFORM public.zc_lock_user_subscriptions(v_user);
  SELECT * INTO v_sub FROM public.subscriptions s WHERE s.id = p_subscription_id FOR UPDATE;

  IF v_sub.status = 'active' AND v_sub.provider_reference = p_provider_reference THEN
    RETURN v_sub; -- duplicate webhook delivery
  END IF;
  IF v_sub.status <> 'pending' THEN
    RAISE EXCEPTION 'subscription_not_pending' USING ERRCODE = 'P0001';
  END IF;
  IF v_sub.plan NOT IN ('monthly', 'yearly') THEN
    RAISE EXCEPTION 'invalid_plan' USING ERRCODE = '22023';
  END IF;

  SELECT t.amount, t.duration INTO v_amount, v_duration FROM public.zc_plan_terms(v_sub.plan) t;
  IF p_amount_paid IS NULL OR p_amount_paid <> v_amount THEN
    RAISE EXCEPTION 'amount_mismatch' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.provider_reference = p_provider_reference AND s.id <> v_sub.id) THEN
    RAISE EXCEPTION 'payment_reference_already_used' USING ERRCODE = 'P0001';
  END IF;

  -- Renewal while a paid plan is still running: the new period starts when it ends.
  SELECT pg_catalog.max(s.period_end) INTO v_start
  FROM public.subscriptions s
  WHERE s.user_id = v_sub.user_id AND s.status = 'active' AND s.period_end > pg_catalog.now();
  v_start := GREATEST(COALESCE(v_start, pg_catalog.now()), pg_catalog.now());

  -- Keep at most one 'active' row per user. Access is not lost: the new row's
  -- period_end is later, and access only checks that period_end is in the future.
  UPDATE public.subscriptions s SET status = 'expired'
  WHERE s.user_id = v_sub.user_id AND s.status = 'active' AND s.id <> v_sub.id;

  BEGIN
    UPDATE public.subscriptions s
    SET status = 'active',
        amount = v_amount,
        provider_reference = p_provider_reference,
        period_start = v_start,
        period_end = v_start + v_duration
    WHERE s.id = v_sub.id
    RETURNING * INTO v_sub;
  EXCEPTION WHEN unique_violation THEN
    -- Another user's activation used this reference at the same moment (unique index backstop).
    RAISE EXCEPTION 'payment_reference_already_used' USING ERRCODE = 'P0001';
  END;
  RETURN v_sub;
END;
$$;

-- ------------------------------------------------------------
-- 6. Current access for the signed-in user
-- ------------------------------------------------------------
-- Only an unexpired 'active' (paid) or 'trial' row grants access.
-- 'pending', 'cancelled', 'expired' and lapsed rows never do.
CREATE OR REPLACE FUNCTION public.get_my_access()
RETURNS TABLE (
  has_access BOOLEAN,
  plan TEXT,
  status TEXT,
  period_end TIMESTAMPTZ,
  trial_used BOOLEAN,
  pending_plan TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH mine AS (
    SELECT * FROM public.subscriptions s WHERE s.user_id = auth.uid()
  ),
  current_access AS (
    SELECT m.plan, m.status, m.period_end FROM mine m
    WHERE m.status IN ('active', 'trial') AND m.period_end > pg_catalog.now()
    ORDER BY (m.status = 'active') DESC, m.period_end DESC
    LIMIT 1
  )
  SELECT
    EXISTS (SELECT 1 FROM current_access),
    (SELECT c.plan FROM current_access c),
    (SELECT c.status FROM current_access c),
    (SELECT c.period_end FROM current_access c),
    EXISTS (SELECT 1 FROM mine m WHERE m.plan = 'trial'),
    (SELECT m.plan FROM mine m WHERE m.status = 'pending' ORDER BY m.created_at DESC LIMIT 1);
$$;

-- ------------------------------------------------------------
-- 7. Housekeeping: mark lapsed rows as expired (service_role only, optional)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_lapsed_subscriptions()
RETURNS INTEGER
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH changed AS (
    UPDATE public.subscriptions s SET status = 'expired'
    WHERE s.status IN ('active', 'trial') AND s.period_end <= pg_catalog.now()
    RETURNING 1
  )
  SELECT pg_catalog.count(*)::INTEGER FROM changed;
$$;

-- ------------------------------------------------------------
-- 8. Privileges
-- ------------------------------------------------------------
-- Browser roles: read-only on subscriptions (RLS limits rows to the user).
-- Revoke every write privilege, at table AND column level.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.subscriptions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.subscriptions FROM anon;
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT grantee, privilege_type, column_name
    FROM information_schema.column_privileges
    WHERE table_schema = 'public' AND table_name = 'subscriptions'
      AND grantee IN ('PUBLIC', 'anon', 'authenticated')
      AND privilege_type IN ('INSERT', 'UPDATE', 'REFERENCES')
  LOOP
    EXECUTE pg_catalog.format('REVOKE %s (%I) ON public.subscriptions FROM %s',
      r.privilege_type, r.column_name, CASE WHEN r.grantee = 'PUBLIC' THEN 'PUBLIC' ELSE pg_catalog.quote_ident(r.grantee) END);
  END LOOP;
END $$;
GRANT SELECT ON public.subscriptions TO authenticated;

-- Functions: nobody by default (Supabase's default privileges grant anon/authenticated).
REVOKE ALL ON FUNCTION public.zc_plan_terms(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.zc_lock_user_subscriptions(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.start_free_trial() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_subscription(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activate_subscription(UUID, TEXT, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_access() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_lapsed_subscriptions() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.zc_plan_terms(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.start_free_trial() TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_subscription(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.zc_lock_user_subscriptions(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.activate_subscription(UUID, TEXT, NUMERIC, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_lapsed_subscriptions() TO service_role;
