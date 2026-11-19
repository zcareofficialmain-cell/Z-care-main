# ZCare — Supabase Integration Report

_Date: 2026-11-11. No credentials appear in this document._

## Status update (2026-11-12)

- All four migrations were applied manually in the SQL Editor: the three listed in section 5, plus `20261111000100_api_grants.sql`. That last one was needed because this project does not auto-grant new tables to the Data API.
- `verify_schema.sql` passed. The signed-in role has exactly the intended access, and signed-out (anon) access is denied.
- Auth: Site URL set to `http://localhost:5173`, and `http://localhost:5173/**` added to the Redirect URLs.
- **End-to-end test done by the project owner with two separate accounts: records are saved and reloaded, and each user sees only their own data.**
- Still open: subscription activation (needs a server-side step), production deployment, and the hardening items in section 10.

The original audit follows.

## Summary

The app reaches the Supabase project and the Auth service answers. **The hosted database has no schema yet: none of the 12 application tables exist.** Signed-in users therefore get `PGRST205` errors on every data page. This was seen in the dev server's relayed browser console (`Could not find the table 'public.profiles'`). The migrations are prepared and reviewed in this repo, but **they have not been applied**.

---

## 1. Supabase connection status

Tested with a read-only probe using the anon key only. It made no writes.

| Check | Result |
|---|---|
| URL configured | Yes (https, `*.supabase.co`) |
| Publishable key configured | Yes (`sb_publishable_*` format) |
| Client initializes | Yes |
| Network → Auth `/auth/v1/health` | **HTTP 200** (GoTrue v2.197.0) |
| `auth.getSession()` | OK (no session, as expected for the probe) |
| PostgREST: 12 app tables | **All missing** (`PGRST205`) |
| Storage buckets | **Not found** (`NoSuchBucket`). Anon cannot fully tell a private bucket from a missing one, but with no schema applied they are almost certainly absent. |

## 2. Environment configuration

- `.env.local` defines `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. These match `src/lib/supabase.ts` and the `ImportMetaEnv` typing in `vite-env.d.ts`.
- `.env` also exists and holds **identical** Supabase values. Vite loads both, and `.env.local` takes precedence. You may delete `.env` to keep one source of truth.
- `.gitignore` covers `.env`, `.env.*` and `*.local`, and re-allows `.env.example`. Note that the folder is **not currently a git repository**.
- `VITE_` variables are bundled into the client. That is fine for the publishable key, which is designed to be public. **Never** put the `service_role` / secret key in a `VITE_` variable.
- There is exactly one `createClient` call (`src/lib/supabase.ts`), shared app-wide.
- `vite.config.ts` sets `build.sourcemap: true`, which publishes full source maps in production. Consider turning it off for production deploys.

## 3. Existing database schema (in migration files)

| Table | Migration | RLS | Notes |
|---|---|---|---|
| profiles | initial | S/I/U/D own | unique `user_id` |
| medications | initial | S/I/U/D own | |
| allergies | initial | S/I/U/D own | |
| insurance_policies | initial | S/I/U/D own | |
| insurance_members | initial | S/I/D own | FK → insurance_policies |
| consultations | initial | S/I/U/D own | |
| medical_documents | initial | S/I/U/D own | FK → consultations |
| reminders | initial | S/I/U/D own | |
| subscriptions | initial | S/I own | no client update/delete (correct) |
| lab_results | extraction | S/I/U/D own | **required**: used by dashboard and the report scanner |
| document_extractions | extraction | S/I/U/D own | **required**: used by the report scanner |
| medical_record_sources | extraction | S/I/U/D own | used for traceability |

All tables use UUID PKs, `user_id → auth.users ON DELETE CASCADE`, and `updated_at` triggers. The TypeScript enums in `src/types` match every SQL `CHECK` constraint.

## 4. Missing database tables

**None are missing from the migration files.** No new tables were created, so there are no duplicates. **All 12 are missing from the hosted database** because no migration has been applied.

## 5. Migration files prepared

Apply them in this order:

1. `supabase/migrations/20250101000000_initial_schema.sql` (existing). Creates 9 tables, RLS, triggers, the 2 private buckets and the storage policies.
2. `supabase/migrations/20250102000000_extraction_tables.sql` (existing). Creates lab_results, document_extractions and medical_record_sources.
3. `supabase/migrations/20261111000000_security_hardening.sql` (**new**, additive, re-runnable):
   - Pins `search_path` on `update_updated_at_column()` (fixes a Supabase linter warning).
   - Adds missing FK indexes: insurance_policies, insurance_members, medical_documents.consultation_id, and subscriptions.
   - Adds a unique index allowing at most one `active` subscription per user.
   - Adds cross-tenant protection (see section 6).
   - Locks down subscription inserts (see section 6).
   - Adds value checks: height and weight ranges, non-negative insurance and subscription amounts, `valid_until ≥ valid_from`, `period_end > period_start`.
   - Sets bucket size and MIME limits (see section 7).

`supabase/verify_schema.sql` is a read-only script to run after applying, to confirm tables, RLS, policies and buckets.

## 6. RLS policies

The existing policies already restrict every table to `auth.uid() = user_id`. The review found **two security gaps**, and the new migration fixes both:

1. **Cross-tenant references.** Foreign-key checks bypass RLS. A user could insert a lab result, extraction, source record, insurance member or document that references *another user's* parent row id. RESTRICTIVE policies now require the referenced parent row to be owned by the same user.
2. **Self-granted subscriptions.** The original INSERT policy allowed a browser client to insert `status = 'active'`, which means a free paid plan. Client inserts are now limited to `status = 'pending'` with no `provider_reference`. Activation must happen server-side after payment verification.

## 7. Storage configuration

- Buckets `medical-documents` and `profile-photos` are defined as **private** (`public = false`) in the initial migration.
- Policy: upload, download, update and delete are allowed only when the first path segment equals `auth.uid()`. The app uploads to `${userId}/...`, which matches.
- The hardening migration adds these limits:
  - `medical-documents`: 20 MB; PDF, PNG and JPEG (matches the upload `accept=` in the UI).
  - `profile-photos`: 5 MB; PNG, JPEG and WebP.
- Medical documents are read through `createSignedUrl(path, 300)` (5-minute URLs). There are no public URLs.
- ⚠ `getProfilePhotoUrl()` in `api.ts` uses `getPublicUrl()`, which **will not work** on a private bucket. It is currently **unused** by any page. If profile photos are surfaced later, switch it to `createSignedUrl`. I did not change it, to avoid altering an API signature nothing calls.

## 8. Authentication integration

- `AuthContext` uses `getSession`, `onAuthStateChange`, `signUp`, `signInWithPassword`, `resetPasswordForEmail` (redirecting to `/reset-password`) and `updateUser`. This is wired correctly for live mode.
- The Auth service is confirmed reachable. An open browser tab already had a live session.
- "Explore Demo" still runs fully from localStorage, independent of Supabase.
- Profiles are **not** auto-created at sign-up. The app handles a `null` profile gracefully, and the user creates one from Profile or Settings. This behaviour is unchanged.
- **Not verified:** a real sign-up, sign-in or password-reset round trip. Those need dashboard configuration (see section 10) and a test account.

## 9. Build and test results

| Step | Result |
|---|---|
| `npm install` | Up to date, 0 vulnerabilities |
| `npm run build` (`tsc` + vite) | **Pass**, 0 TypeScript errors. Warning only: main chunk ~1.2 MB (code-splitting recommended). |
| `npm test` | **14/14 pass** (before and after changes) |
| `npm run dev` | Starts on :5173. All 15 routes return 200, and the core modules transform without errors. |
| Runtime against live DB | **Fails on data access** (`PGRST205`) until migrations are applied |

**Code changes made** (service layer only; no UI or theme changes):

- `src/services/api.ts`: added `blanksToNull()`, used in the `updateMedication`, `updateAllergy`, `updateConsultation` and `updateDocumentMetadata` Supabase paths. Edit forms send `''` for blank dates and `consultation_id`, which Postgres rejects for `DATE` and `UUID` columns. Without this fix, editing a record with a blank optional date would fail once the DB is live.
- `src/services/api.ts`: `getSubscription()` now uses `.order().limit(1).maybeSingle()` instead of `.single()`.

## 10. Remaining manual steps

1. **Review and apply the migrations** (Dashboard → SQL Editor, in the order listed in section 5, or with `supabase link` + `supabase db push`). Nothing has been applied to the hosted project.
   - If the SQL Editor rejects the `storage.objects` policies with "must be owner", create the two storage policies from Dashboard → Storage → Policies, using the same expressions.
2. Run `supabase/verify_schema.sql` and confirm that every table exists with RLS on and both buckets are private.
3. Configure Auth: Dashboard → Authentication → URL Configuration. Set **Site URL** to your origin and add `http://localhost:5173/**` and your production URL to the **Redirect URLs** (needed for email confirmation and `/reset-password`). Decide whether email confirmation stays on.
4. Run an end-to-end test with a real account: sign up, create a profile, add one record of each type, upload a PDF, open it, then delete it. Then sign in as a **second** account and confirm it sees none of the first account's data.
5. Payments: in live mode, `PlansPage` creates `pending` subscriptions only, so nobody becomes `active`. A server-side component (Edge Function plus payment webhook, using the service role) is needed to activate subscriptions.
6. Optional: delete the duplicate `.env`, turn off production source maps, `git init` the project, and switch `getProfilePhotoUrl` to signed URLs when the feature is used.
