# ZCare — Migration Execution Checklist (Supabase SQL Editor)

Reviewed 2026-11-11. All three migrations were executed in order on a local, throwaway PostgreSQL engine (PGlite). That engine had stubs for Supabase's `auth` and `storage` schemas and its roles. Results:

- Syntax and ordering: all three files apply in order, with no errors.
- Re-running the hardening file: no errors.
- Isolation and security tests: **74/74 passed**. They cover user-to-user isolation on all 12 tables, anonymous access, cross-tenant references, self-granted subscriptions, constraints, storage folder isolation and cascades.

The hosted database has **not** been touched.

## Files, in execution order

| # | File | Purpose | Changes the DB? |
|---|---|---|---|
| 0 | `supabase/preflight_check.sql` | Confirms the project is in the expected state | No (read-only) |
| 1 | `supabase/migrations/20250101000000_initial_schema.sql` | 9 core tables, RLS, triggers, 2 private buckets, storage policies | **Yes** |
| 2 | `supabase/migrations/20250102000000_extraction_tables.sql` | lab_results, document_extractions, medical_record_sources | **Yes** |
| 3 | `supabase/migrations/20261111000000_security_hardening.sql` | Cross-tenant and subscription policies, indexes, checks, bucket limits | **Yes** |
| 4 | `supabase/verify_schema.sql` | Confirms tables, RLS, policies, buckets and API grants | No (read-only) |

## Steps

**Step 0: Pre-flight.** Run `preflight_check.sql`. Expected output:

| Column | Expected |
|---|---|
| existing_zcare_tables | `0` |
| uuid_ossp_schema | `extensions` |
| search_path | contains `extensions` |
| existing_buckets | `0` |
| existing_storage_policies | `0` |
| existing_trigger_fn | `0` |

If any value differs, **stop** (see "If something fails" below).

**Steps 1–3: Migrations.** For each file, in order:

1. Open a **new** SQL Editor tab.
2. Type `BEGIN;` on the first line.
3. Paste the **entire** file below it.
4. Type `COMMIT;` on the last line.
5. Run it. Expected result: "Success. No rows returned".

The `BEGIN;`/`COMMIT;` wrapper makes each file all-or-nothing. **This matters for file 1.** Its `CREATE POLICY` and `CREATE TRIGGER` statements cannot be re-run, so a half-applied file 1 would need manual cleanup.

Run the files strictly in order. File 2 depends on file 1 (`medical_documents`, the trigger function). File 3 depends on both. File 3 is the only one that can safely be run more than once.

**Step 4: Verify.** Run `verify_schema.sql`. Expected results:

- Every table shows `exists = true` and `rls_enabled = true`.
- The "table without RLS" query returns **0 rows**.
- Both buckets show `public = false`, with limits of 20 MB and 5 MB.
- There are **2 storage policies**.
- Every grant column is `true`.

**Step 5: App check.** Reload ZCare in the browser. The `PGRST205 … schema cache` errors should be gone. Ask me to re-run the read-only connection probe to confirm.

## Statements needing special permissions or dashboard settings

| Statement | Where | Note |
|---|---|---|
| `CREATE POLICY … ON storage.objects` (×2) | file 1, section 10 | **Highest risk.** It needs owner-level rights on `storage.objects`, which Supabase owns. It normally works from the SQL Editor. If it fails with *"must be owner of table objects"*, the whole transaction rolls back. |
| `INSERT INTO storage.buckets` / `UPDATE storage.buckets` | file 1, file 3 | Normally permitted for the `postgres` role. |
| `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"` | file 1 | Pre-installed on Supabase, so this does nothing. If it is not installed, enable it under Dashboard → Database → Extensions, in the `extensions` schema. |
| `ALTER FUNCTION … SET search_path` | file 3 | Normal: you own the function after file 1. |
| Table grants to `authenticated` | none in the files | Supabase grants these automatically **unless** the project has automatic Data API exposure of new tables turned off. Step 4 detects this. |
| Auth URL configuration | Dashboard only | Authentication → URL Configuration: set the Site URL and add `http://localhost:5173/**` and your production URL to the Redirect URLs. |

## If something fails

- **Any error inside a `BEGIN … COMMIT` block:** nothing was applied. If the editor reports an aborted transaction, run `ROLLBACK;`. Then **stop and send me the exact error text**. Do not edit and re-run blindly.
- **"must be owner of table objects"** (file 1): send me the error. I will split the two storage policies out so you can create them under Dashboard → Storage → Policies. The rest of file 1 then runs unchanged.
- **`function uuid_generate_v4() does not exist`**: enable `uuid-ossp` (see the table above), then re-run file 1.
- **Step 4 shows grant columns `false`:** send me the result. The fix is a `GRANT SELECT, INSERT, UPDATE, DELETE ON <tables> TO authenticated;`, which I will prepare for your review. Do not grant anything to `anon`.
- **App still shows `PGRST205` after step 4:** run `NOTIFY pgrst, 'reload schema';`. It only refreshes the API's schema cache and changes no data.

## Known, accepted (non-blocking)

- The Supabase Performance Advisor will likely suggest wrapping `auth.uid()` as `(select auth.uid())` in the original policies. This is a performance hint at scale, not a security issue.
- `insurance_members` has no UPDATE policy. The app only adds and removes members, so this is intentional.
- The original policies have no `TO authenticated` clause. They are still safe, because `auth.uid()` is NULL for anonymous users, and the tests confirm anonymous users see 0 rows.
- The initial migration's header still says "D-REC". This is cosmetic.
