# ZCare — Supabase Backend Integration: Project Report

_Period: 11–12 November 2026 · No credentials appear in this document._

## 1. Outcome

ZCare is now a **live, database-backed application** running on Supabase:

- All medical records are stored in PostgreSQL, not in the browser.
- Each user can access only their own records, enforced by Row Level Security in the database.
- Medical documents and profile photos are stored in **private** storage buckets.
- Sign-up, email confirmation and sign-in work against Supabase Auth.
- **Verified by the project owner:** two separate accounts tested end to end. Records are saved and reloaded, and neither user can see the other's data.

The UI and the emerald/teal theme were not changed.

---

## 2. Timeline of work

| # | Phase | What happened | Result |
|---|---|---|---|
| 1 | Configuration audit | Checked `.env.local`, the Supabase client, Vite env typing and `.gitignore` | ✅ Correct; one shared client |
| 2 | Live connection test | Read-only probe of URL, key, Auth and tables | Auth ✅; **database empty (0 of 12 tables)** |
| 3 | Backend audit | Read both existing migrations and all services; compared types to SQL | All tables defined; **2 security gaps + 1 app bug found** |
| 4 | Migration prep | Wrote the security-hardening migration | Additive, re-runnable |
| 5 | Code fixes | Two fixes in the service layer (`api.ts`) | Build ✅, 14/14 tests ✅ |
| 6 | Pre-execution review | Ran all migrations on a local Postgres (PGlite) with Supabase stubs | **74/74 security tests passed** |
| 7 | Execution (by owner) | Pre-flight check → migrations 1–3 in the SQL Editor | ✅ All succeeded |
| 8 | Verification | `verify_schema.sql` showed the API role had no table access | Found missing grants |
| 9 | Grants migration | Wrote a least-privilege grants migration; retested locally | **75/75 passed**; applied by owner ✅ |
| 10 | Auth configuration (by owner) | Site URL and Redirect URLs set to `localhost:5173` | ✅ |
| 11 | End-to-end test (by owner) | Two accounts, full CRUD and document upload | ✅ Working and isolated |
| 12 | Paused | Dev server stopped | — |

---

## 3. Environment and configuration

| Item | Status |
|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` | Present; names match `src/lib/supabase.ts` and `vite-env.d.ts` |
| Supabase client | Exactly one `createClient` call, shared app-wide |
| `.gitignore` | Excludes `.env`, `.env.*` and `*.local` |
| Duplicate `.env` | Contains identical values (cleanup pending) |
| Secret / service-role key in frontend | None (correct) |

---

## 4. Database

### Tables (12, all with UUID primary keys, ownership via `user_id → auth.users ON DELETE CASCADE`, and Row Level Security)

| Area | Tables |
|---|---|
| Patient | profiles |
| Clinical | medications, allergies, consultations, lab_results |
| Documents | medical_documents, document_extractions, medical_record_sources |
| Insurance | insurance_policies, insurance_members |
| Other | reminders, subscriptions |

### Migrations applied (in order)

| # | File | Purpose |
|---|---|---|
| 1 | `20250101000000_initial_schema.sql` | 9 core tables, RLS, `updated_at` triggers, 2 private buckets, storage policies |
| 2 | `20250102000000_extraction_tables.sql` | lab_results, document_extractions, medical_record_sources |
| 3 | `20261111000000_security_hardening.sql` | **New.** Cross-tenant protection, subscription lock-down, indexes, value checks, bucket limits |
| 4 | `20261111000100_api_grants.sql` | **New.** Least-privilege Data API access |

### Security fixes added

1. **Cross-user references blocked.** Foreign-key checks bypass RLS. Without this fix, a user could attach records (lab results, extractions, insurance members, documents) to another user's IDs. Restrictive policies now require the referenced record to belong to the same user.
2. **Self-granted subscriptions blocked.** A browser could insert an `active` (paid) subscription for itself. Clients can now create only `pending` subscriptions, and activation must happen server-side.
3. **Least-privilege access:**
   - Signed-in users get only the operations the app uses. There is no UPDATE on insurance members, and no UPDATE or DELETE on subscriptions.
   - Signed-out visitors get **no** table access at all.
4. **Other hardening:**
   - The trigger function's `search_path` is pinned.
   - Missing foreign-key indexes were added.
   - Each user can have at most one active subscription.
   - Range checks were added for height, weight, insurance amounts and dates, and subscription periods.

---

## 5. Storage

| Bucket | Visibility | Limit | Allowed types |
|---|---|---|---|
| medical-documents | **Private** | 20 MB | PDF, PNG, JPEG |
| profile-photos | **Private** | 5 MB | PNG, JPEG, WebP |

- Users can upload, read, update and delete only files under their own `<user-id>/` folder.
- Documents are opened through signed URLs that expire after 5 minutes. Nothing is publicly accessible.

---

## 6. Application code changes

All changes are in the service layer (`src/services/api.ts`). There are no UI changes.

| Change | Why |
|---|---|
| Added `blanksToNull()` in the update functions for medications, allergies, consultations and document metadata | Edit forms send `''` for blank dates and IDs, and Postgres rejects those for DATE and UUID columns. Without the fix, editing a record with a blank date would fail. |
| `getSubscription()` now uses `maybeSingle()` with ordering | Avoids errors when a user has no subscription |

---

## 7. Testing summary

| Test | Result |
|---|---|
| `npm install` | 0 vulnerabilities |
| `npm run build` (TypeScript + Vite) | Pass, 0 errors (large-bundle warning only) |
| `npm test` | 14/14 pass |
| `npm run dev`: all 15 routes | 200 OK |
| Local migration and security suite (PGlite) | 75/75 pass |
| Pre-flight and verification on the live project | All expected values |
| Owner's live two-account test | ✅ Works; data isolated |

---

## 8. Files created

| File | Purpose |
|---|---|
| `supabase/migrations/20261111000000_security_hardening.sql` | Security and integrity migration |
| `supabase/migrations/20261111000100_api_grants.sql` | Data API grants |
| `supabase/preflight_check.sql` | Read-only check run before the migrations |
| `supabase/verify_schema.sql` | Read-only check run after the migrations |
| `docs/SUPABASE_INTEGRATION_REPORT.md` | Initial audit and status |
| `docs/MIGRATION_EXECUTION_CHECKLIST.md` | Step-by-step execution guide |
| `docs/ZCARE_PROJECT_REPORT.md` | This report |

Modified: `src/services/api.ts`.

---

## 9. Remaining work

### Before real patients use it
1. **Custom SMTP** (Authentication → Emails). The built-in sender allows only a few emails per hour.
2. **Version control.** The folder is not a git repository yet.
3. **Auth hardening:** leaked-password protection, a minimum password length of 8 or more, and optionally MFA.
4. **Backups.** The Free plan has no point-in-time recovery. A paid plan is recommended for medical data.

### Features
5. **Payments.** Needs a payment provider and a Supabase Edge Function to verify payments and activate subscriptions.
6. **Profile photos.** `getProfilePhotoUrl()` must switch to signed URLs before photos are shown in the UI.
7. **Production deployment.** Add the live domain to the Auth URLs and set the env variables on the host.

### Cleanups
8. Delete the duplicate `.env`.
9. Disable production source maps (`vite.config.ts`).
10. Code-split the 1.2 MB main bundle.
