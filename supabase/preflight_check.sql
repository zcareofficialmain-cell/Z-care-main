-- ============================================================
-- ZCARE — READ-ONLY PRE-FLIGHT CHECK
-- Run in Supabase Dashboard > SQL Editor BEFORE applying migrations.
-- Contains only SELECT statements; changes nothing.
-- ============================================================

SELECT
  -- 1. Must be 0: no ZCare tables yet (otherwise CREATE POLICY in migration 1 will fail)
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('profiles','medications','allergies','insurance_policies','insurance_members',
                         'consultations','medical_documents','reminders','subscriptions',
                         'lab_results','document_extractions','medical_record_sources'))
    AS existing_zcare_tables,

  -- 2. Expect 'extensions': schema where uuid-ossp is installed (NULL = not installed; enable it first)
  (SELECT extnamespace::regnamespace::text FROM pg_extension WHERE extname = 'uuid-ossp')
    AS uuid_ossp_schema,

  -- 3. Must include "extensions" so uuid_generate_v4() resolves unqualified
  current_setting('search_path') AS search_path,

  -- 4. Must be 0: buckets not created yet (migration 1 uses ON CONFLICT DO NOTHING, so >0 is harmless)
  (SELECT count(*) FROM storage.buckets WHERE id IN ('medical-documents','profile-photos'))
    AS existing_buckets,

  -- 5. Must be 0: storage policy names used by migration 1 must not exist yet
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname IN ('Users can access own medical documents','Users can access own profile photos'))
    AS existing_storage_policies,

  -- 6. Must be 0: no existing function with the trigger helper name
  (SELECT count(*) FROM pg_proc WHERE proname = 'update_updated_at_column'
     AND pronamespace = 'public'::regnamespace)
    AS existing_trigger_fn,

  -- 7. Informational: who owns storage.objects (CREATE POLICY there needs owner-level rights)
  (SELECT tableowner FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'objects')
    AS storage_objects_owner,
  current_user AS running_as;
