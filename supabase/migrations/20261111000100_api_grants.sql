-- ============================================================
-- ZCARE — DATA API TABLE GRANTS
-- ============================================================
-- This project does not auto-grant new public tables to the API roles, so
-- the browser client (role "authenticated") currently gets
-- "permission denied" (42501) on every table.
--
-- Least privilege:
--   * authenticated: only the operations the app performs. RLS still
--     restricts every operation to the user's own rows.
--   * anon (signed-out visitors): NOTHING. Not granted on purpose.
--   * service_role: full access, for future server-side jobs such as
--     activating subscriptions after payment (bypasses RLS; server only).
-- Safe to re-run: GRANT is idempotent.
-- ============================================================

GRANT USAGE ON SCHEMA public TO authenticated, service_role;

-- Full CRUD on the user's own medical records (RLS-limited)
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.profiles,
  public.medications,
  public.allergies,
  public.insurance_policies,
  public.consultations,
  public.medical_documents,
  public.reminders,
  public.lab_results,
  public.document_extractions,
  public.medical_record_sources
TO authenticated;

-- Members are only added and removed by the app; there is no UPDATE policy
GRANT SELECT, INSERT, DELETE ON public.insurance_members TO authenticated;

-- Subscriptions: read, and create 'pending' only (enforced by RLS).
-- No UPDATE/DELETE from the browser.
GRANT SELECT, INSERT ON public.subscriptions TO authenticated;

-- Server-side role
GRANT ALL ON
  public.profiles, public.medications, public.allergies,
  public.insurance_policies, public.insurance_members, public.consultations,
  public.medical_documents, public.reminders, public.subscriptions,
  public.lab_results, public.document_extractions, public.medical_record_sources
TO service_role;
