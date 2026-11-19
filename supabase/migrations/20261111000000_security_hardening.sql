-- ============================================================
-- ZCARE — SECURITY & INTEGRITY HARDENING (additive)
-- ============================================================
-- Run AFTER:
--   20250101000000_initial_schema.sql
--   20250102000000_extraction_tables.sql
--
-- Properties:
--   * Creates no tables, drops no tables / columns / existing policies.
--   * Safe to re-run (every statement is guarded or IF NOT EXISTS).
--   * The only DROP statements remove policies *introduced by this file*
--     so the file can be re-applied; they never touch the original policies.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Pin search_path on the trigger function
--    (fixes Supabase linter warning "function_search_path_mutable")
-- ------------------------------------------------------------
ALTER FUNCTION public.update_updated_at_column() SET search_path = '';


-- ------------------------------------------------------------
-- 2. Missing indexes on foreign keys / common filters
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_insurance_policies_user   ON public.insurance_policies(user_id);
CREATE INDEX IF NOT EXISTS idx_insurance_members_policy  ON public.insurance_members(policy_id);
CREATE INDEX IF NOT EXISTS idx_insurance_members_user    ON public.insurance_members(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_consultation    ON public.medical_documents(consultation_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status ON public.subscriptions(user_id, status);

-- At most one ACTIVE subscription per user (getSubscription() expects a single row).
CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_one_active_per_user
  ON public.subscriptions(user_id) WHERE status = 'active';


-- ------------------------------------------------------------
-- 3. Cross-tenant reference protection
--
--    The original policies check only `auth.uid() = user_id` on the row
--    itself. Foreign-key checks bypass RLS, so a user could insert a child
--    row that points at ANOTHER user's parent row (e.g. attach a lab result
--    to someone else's document id). These RESTRICTIVE policies are ANDed
--    with the existing permissive ones and require the referenced parent
--    row to belong to the same user.
-- ------------------------------------------------------------

-- insurance_members.policy_id -> insurance_policies
DROP POLICY IF EXISTS "zc_members_policy_owned_ins" ON public.insurance_members;
CREATE POLICY "zc_members_policy_owned_ins"
  ON public.insurance_members AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.insurance_policies p
    WHERE p.id = insurance_members.policy_id AND p.user_id = (SELECT auth.uid())
  ));

-- medical_documents.consultation_id -> consultations (nullable)
DROP POLICY IF EXISTS "zc_documents_consultation_owned_ins" ON public.medical_documents;
CREATE POLICY "zc_documents_consultation_owned_ins"
  ON public.medical_documents AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (consultation_id IS NULL OR EXISTS (
    SELECT 1 FROM public.consultations c
    WHERE c.id = medical_documents.consultation_id AND c.user_id = (SELECT auth.uid())
  ));
DROP POLICY IF EXISTS "zc_documents_consultation_owned_upd" ON public.medical_documents;
CREATE POLICY "zc_documents_consultation_owned_upd"
  ON public.medical_documents AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (consultation_id IS NULL OR EXISTS (
    SELECT 1 FROM public.consultations c
    WHERE c.id = medical_documents.consultation_id AND c.user_id = (SELECT auth.uid())
  ));

-- lab_results.medical_document_id -> medical_documents (nullable)
DROP POLICY IF EXISTS "zc_labs_document_owned_ins" ON public.lab_results;
CREATE POLICY "zc_labs_document_owned_ins"
  ON public.lab_results AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (medical_document_id IS NULL OR EXISTS (
    SELECT 1 FROM public.medical_documents d
    WHERE d.id = lab_results.medical_document_id AND d.user_id = (SELECT auth.uid())
  ));
DROP POLICY IF EXISTS "zc_labs_document_owned_upd" ON public.lab_results;
CREATE POLICY "zc_labs_document_owned_upd"
  ON public.lab_results AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (medical_document_id IS NULL OR EXISTS (
    SELECT 1 FROM public.medical_documents d
    WHERE d.id = lab_results.medical_document_id AND d.user_id = (SELECT auth.uid())
  ));

-- document_extractions.medical_document_id -> medical_documents
DROP POLICY IF EXISTS "zc_extractions_document_owned_ins" ON public.document_extractions;
CREATE POLICY "zc_extractions_document_owned_ins"
  ON public.document_extractions AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.medical_documents d
    WHERE d.id = document_extractions.medical_document_id AND d.user_id = (SELECT auth.uid())
  ));
DROP POLICY IF EXISTS "zc_extractions_document_owned_upd" ON public.document_extractions;
CREATE POLICY "zc_extractions_document_owned_upd"
  ON public.document_extractions AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.medical_documents d
    WHERE d.id = document_extractions.medical_document_id AND d.user_id = (SELECT auth.uid())
  ));

-- medical_record_sources.medical_document_id -> medical_documents
DROP POLICY IF EXISTS "zc_sources_document_owned_ins" ON public.medical_record_sources;
CREATE POLICY "zc_sources_document_owned_ins"
  ON public.medical_record_sources AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.medical_documents d
    WHERE d.id = medical_record_sources.medical_document_id AND d.user_id = (SELECT auth.uid())
  ));
DROP POLICY IF EXISTS "zc_sources_document_owned_upd" ON public.medical_record_sources;
CREATE POLICY "zc_sources_document_owned_upd"
  ON public.medical_record_sources AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.medical_documents d
    WHERE d.id = medical_record_sources.medical_document_id AND d.user_id = (SELECT auth.uid())
  ));


-- ------------------------------------------------------------
-- 4. Subscriptions: block self-granted paid plans
--
--    The original INSERT policy lets a signed-in user insert a row with
--    status = 'active' directly from the browser, i.e. grant themselves a
--    paid plan. The app itself only ever inserts 'pending'. Restrict client
--    inserts to unpaid 'pending' rows; activation must be done server-side
--    (service role / Edge Function after payment verification).
--    There is intentionally still NO client UPDATE or DELETE policy.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "zc_subscriptions_client_insert_pending_only" ON public.subscriptions;
CREATE POLICY "zc_subscriptions_client_insert_pending_only"
  ON public.subscriptions AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (status = 'pending' AND provider_reference IS NULL);


-- ------------------------------------------------------------
-- 5. Value constraints (tables are empty on first apply; guarded for re-runs)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_profiles_height_range') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT chk_profiles_height_range
      CHECK (height IS NULL OR (height > 0 AND height < 300));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_profiles_weight_range') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT chk_profiles_weight_range
      CHECK (weight IS NULL OR (weight > 0 AND weight < 700));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_insurance_amounts_nonneg') THEN
    ALTER TABLE public.insurance_policies ADD CONSTRAINT chk_insurance_amounts_nonneg
      CHECK ((sum_insured IS NULL OR sum_insured >= 0) AND (premium IS NULL OR premium >= 0));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_insurance_validity_order') THEN
    ALTER TABLE public.insurance_policies ADD CONSTRAINT chk_insurance_validity_order
      CHECK (valid_from IS NULL OR valid_until IS NULL OR valid_until >= valid_from);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_subscriptions_amount_nonneg') THEN
    ALTER TABLE public.subscriptions ADD CONSTRAINT chk_subscriptions_amount_nonneg
      CHECK (amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_subscriptions_period_order') THEN
    ALTER TABLE public.subscriptions ADD CONSTRAINT chk_subscriptions_period_order
      CHECK (period_end > period_start);
  END IF;
END $$;


-- ------------------------------------------------------------
-- 6. Storage buckets: enforce private + size / MIME limits
--    (buckets themselves are created in 20250101000000_initial_schema.sql)
-- ------------------------------------------------------------
UPDATE storage.buckets
SET public = false,
    file_size_limit = 20971520,                                       -- 20 MB
    allowed_mime_types = ARRAY['application/pdf', 'image/png', 'image/jpeg']
WHERE id = 'medical-documents';

UPDATE storage.buckets
SET public = false,
    file_size_limit = 5242880,                                        -- 5 MB
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp']
WHERE id = 'profile-photos';
