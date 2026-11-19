-- ============================================================
-- ROLLBACK for 20261120000000_admin_rbac.sql
-- ============================================================
-- Removes admin roles, account suspension, the admin audit log and all admin
-- functions. Existing user data, policies and membership functions are untouched.
-- WARNING: deletes the admin list, suspension records and the audit history.
-- Export admin_audit_log first if you need to keep it.
-- Suspended accounts become active again.
-- ============================================================
BEGIN;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles', 'medications', 'allergies', 'insurance_policies', 'insurance_members', 'consultations',
                           'medical_documents', 'reminders', 'subscriptions', 'lab_results', 'document_extractions', 'medical_record_sources']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS zc_account_active ON public.%I', t);
  END LOOP;
END $$;
DROP POLICY IF EXISTS zc_account_active_storage ON storage.objects;

DROP FUNCTION IF EXISTS public.zc_transfer_super_admin(text, boolean);
DROP FUNCTION IF EXISTS public.zc_bootstrap_super_admin(text);
DROP FUNCTION IF EXISTS public.admin_expire_lapsed_subscriptions();
DROP FUNCTION IF EXISTS public.admin_system_info();
DROP FUNCTION IF EXISTS public.admin_audit_log(integer, integer, text);
DROP FUNCTION IF EXISTS public.admin_revoke_admin(uuid);
DROP FUNCTION IF EXISTS public.admin_grant_admin(text);
DROP FUNCTION IF EXISTS public.admin_list_admins();
DROP FUNCTION IF EXISTS public.admin_list_subscriptions(text, text, integer, integer);
DROP FUNCTION IF EXISTS public.admin_set_account_status(uuid, text, text);
DROP FUNCTION IF EXISTS public.admin_get_user(uuid);
DROP FUNCTION IF EXISTS public.admin_list_users(text, text, integer, integer);
DROP FUNCTION IF EXISTS public.admin_overview();
DROP FUNCTION IF EXISTS public.zc_is_active_user();
DROP FUNCTION IF EXISTS public.zc_my_account_status();
DROP FUNCTION IF EXISTS public.zc_my_admin_role();
DROP FUNCTION IF EXISTS public.zc_require_admin(boolean);
DROP FUNCTION IF EXISTS public.zc_audit(uuid, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.zc_is_suspended(uuid);
DROP FUNCTION IF EXISTS public.zc_admin_role_of(uuid);

DROP TABLE IF EXISTS public.admin_audit_log;   -- drops trg_guard_audit_log
DROP TABLE IF EXISTS public.account_status;
DROP TABLE IF EXISTS public.app_admins;        -- drops trg_guard_super_admin
DROP FUNCTION IF EXISTS public.zc_guard_audit_log();
DROP FUNCTION IF EXISTS public.zc_guard_super_admin();

COMMIT;
