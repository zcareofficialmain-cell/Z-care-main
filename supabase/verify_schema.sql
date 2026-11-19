-- ============================================================
-- ZCARE — READ-ONLY SCHEMA VERIFICATION
-- Run in Supabase Dashboard > SQL Editor AFTER applying migrations.
-- Contains only SELECT statements; changes nothing.
-- ============================================================

-- 1. Expected tables present + RLS enabled (every row should show rls_enabled = true)
SELECT t.table_name,
       (t.table_name IS NOT NULL)          AS exists,
       c.relrowsecurity                    AS rls_enabled
FROM (VALUES ('profiles'),('medications'),('allergies'),('insurance_policies'),
             ('insurance_members'),('consultations'),('medical_documents'),
             ('reminders'),('subscriptions'),('lab_results'),
             ('document_extractions'),('medical_record_sources')) AS e(name)
LEFT JOIN information_schema.tables t
       ON t.table_schema = 'public' AND t.table_name = e.name
LEFT JOIN pg_class c
       ON c.relname = e.name AND c.relnamespace = 'public'::regnamespace
ORDER BY e.name;

-- 2. Any public table WITHOUT RLS (should return zero rows)
SELECT relname AS table_without_rls
FROM pg_class
WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND NOT relrowsecurity;

-- 3. Policy count per table (permissive + restrictive)
SELECT tablename, permissive, cmd, count(*) AS policies
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename, permissive, cmd
ORDER BY tablename, permissive, cmd;

-- 4. Storage buckets: both must be public = false
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id IN ('medical-documents', 'profile-photos');

-- 5. Storage policies
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects';

-- 6. Data API grants: the browser client (role "authenticated") must be able to
--    reach each table; RLS then limits it to the user's own rows.
--    Every column should be true. If any is false, the app gets
--    "permission denied for table ..." (42501) — see the execution checklist.
SELECT c.relname AS table_name,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS can_select,
       has_table_privilege('authenticated', c.oid, 'INSERT') AS can_insert,
       has_table_privilege('authenticated', c.oid, 'UPDATE') AS can_update,
       has_table_privilege('authenticated', c.oid, 'DELETE') AS can_delete
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
ORDER BY c.relname;
