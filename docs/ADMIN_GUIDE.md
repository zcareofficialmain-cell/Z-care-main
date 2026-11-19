# ZCare Admin — Setup, Security and Operations

## What it is

- **Roles:** `super_admin` (exactly one), `admin` (optional, any number), and regular users (no role).
- **Admin Dashboard** at `/admin`. It is shown only to administrators, and **every** action is authorised again by the database.

| Capability | Admin | Super Admin |
|---|:---:|:---:|
| Overview statistics, user list, user account details | ✓ | ✓ |
| Membership list, filters, payment references, history | ✓ | ✓ |
| Deactivate / reactivate **regular** accounts (reason required) | ✓ | ✓ |
| Deactivate / reactivate **admin** accounts | — | ✓ |
| Grant / revoke Admin | — | ✓ |
| System housekeeping (mark lapsed subscriptions expired) | — | ✓ |
| Read the audit log | ✓ | ✓ |
| See patients' medical records | ✗ | ✗ |
| Activate a paid plan / change prices | ✗ | ✗ |

## Security model (migration `20261120000000_admin_rbac.sql`)

- **Roles:** stored in `public.app_admins`. Browser roles have **no** privileges on it, and RLS is on with no policies. The app reads the caller's own role only through `zc_my_admin_role()`.
- **Database-side checks:** every `admin_*` function calls `zc_require_admin()`, which reads the role for `auth.uid()` inside the database. Hidden routes, frontend checks and emails in code are never trusted.
- **Exactly one Super Admin:**
  - A unique index allows only one `super_admin` row.
  - A trigger blocks deleting or demoting it except inside `zc_transfer_super_admin()`. This also applies to the database owner and blocks deleting the Super Admin's auth account.
- **Bootstrap and transfer procedures:** these have **no** API grants and run only in the SQL Editor (as `postgres`).
- **Deactivation:** writes `public.account_status`. A **RESTRICTIVE** policy `zc_account_active` on every user-data table, and on the `medical-documents` / `profile-photos` storage buckets, denies all reads and writes for suspended accounts. Restrictive policies can only narrow access; no existing policy was changed.
- **Patient privacy:**
  - Admins get **no** policy on medical tables. Admin functions return account data (email, dates, sign-in method), profile name and language, and membership rows only.
  - Opening a user's details is itself audited.
  - Support access to medical records is **not** implemented. Any future version must be separate, explicit, time-limited and audited.
- **Audit log:** `public.admin_audit_log` is append-only. A trigger blocks UPDATE and DELETE for everyone, including the service role. Each entry records the actor, action, target, time and non-sensitive metadata (reason, role, row count). Passwords, tokens and medical content are never logged.
- **Payments:** unchanged. Paid activation still needs the service role and a verified payment (`activate_subscription`). Admins cannot activate plans. The trial rules (24 h, once per account) are untouched.

## 1. Apply the migration (manual, SQL Editor)

1. Supabase → **SQL Editor** → paste and run `supabase/migrations/20261120000000_admin_rbac.sql`.
   - You may see a "destructive operation" warning because the file contains `REVOKE` and `DROP POLICY IF EXISTS`. That's expected: it only drops policies this same file creates, so re-running it is safe.
2. Verify:
   ```sql
   SELECT has_function_privilege('authenticated','public.admin_overview()','EXECUTE')           AS admin_rpc_callable,   -- true (role checked inside)
          has_function_privilege('authenticated','public.zc_bootstrap_super_admin(text)','EXECUTE') AS browser_can_bootstrap, -- false
          has_table_privilege('authenticated','public.app_admins','SELECT')                     AS browser_reads_roles,  -- false
          (SELECT count(*) FROM pg_policies WHERE policyname = 'zc_account_active')             AS suspension_policies;  -- 12
   ```
3. Deploy the frontend after the migration. The app also works before it: users simply see no admin menu.

## 2. Create the client's Super Admin (one time)

1. The client signs up in ZCare with **their own email and a strong password**, and confirms the email. Alternatively, create the user in **Authentication → Users → Add user** and tick "Auto confirm".
2. In the **SQL Editor**, run (replacing the email):
   ```sql
   SELECT public.zc_bootstrap_super_admin('client@their-domain.com');
   ```
   It refuses unknown or unconfirmed emails, suspended accounts, and any second Super Admin.
3. The client signs out and back in. **Admin** now appears in the navigation.
4. Recommended: turn on **MFA** for this account (Authentication → Multi-Factor) and use a unique password.

No credentials are stored in code, and the service-role key is never used in the frontend.

## 3. Change the Super Admin later

```sql
-- new owner must already have a confirmed ZCare account
SELECT public.zc_transfer_super_admin('new.owner@their-domain.com', false);  -- false: previous owner loses admin access
SELECT public.zc_transfer_super_admin('new.owner@their-domain.com', true);   -- true: previous owner becomes an Admin
```

The transfer is recorded in the audit log. To delete the old owner's login entirely, transfer first; deleting a Super Admin's auth account is blocked.

## 4. Deactivated accounts

- A deactivated user can still **sign in**, but sees "Account deactivated" and cannot read or write any data. The database enforces this.
- Their records are kept. Reactivate from the dashboard; the reason and both actions are audited.
- Optional stronger block that refuses sign-in itself: not included, because it requires the Supabase Admin API with the service-role key. Implement it as an Edge Function that calls `auth.admin.updateUserById(id, { ban_duration })` after checking the caller is an admin.
- **Account deletion is not offered** in the dashboard. Deleting health records needs a separate confirmation and data-retention procedure; decide your retention policy before adding it.

## 5. Rollback

`supabase/rollbacks/20261120000000_admin_rbac.down.sql` removes every admin object and re-activates suspended accounts. User data, existing policies and the membership functions are untouched. **It deletes the audit history**, so export `admin_audit_log` first if needed.

## 6. Tests

- `supabase/tests/admin_rbac.db-test.mjs`: real PostgreSQL 17 (see its header for how to run), 87 checks covering bootstrap, escalation attempts, grant/revoke, Super Admin protection, statistics, search, privacy, deactivation (including storage), membership rules, housekeeping, the audit log, transfer, and rollback.
- `supabase/tests/membership_plans.db-test.mjs`: still 59/59.
- These run on a local PostgreSQL with Supabase's `auth` schema stubbed. **They do not prove behaviour on hosted Supabase.** After applying, run the verification query above and the manual checks below.

## 7. Manual checks on hosted Supabase (after applying)

1. With a **regular** account: open `/admin` → redirected to the dashboard; there's no Admin menu.
2. With the **Super Admin**: the overview numbers match Authentication → Users and the `subscriptions` table.
3. Deactivate a **test** account with a reason → that account sees "Account deactivated" and no data. Reactivate it → its data is back. Both actions appear in the Audit log.
4. Grant Admin to a second test account, sign in as it, and confirm: no "Grant Admin" form, no housekeeping button. Revoke it.
