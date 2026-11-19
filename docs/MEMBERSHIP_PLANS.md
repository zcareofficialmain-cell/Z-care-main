# ZCare Membership Plans — Setup & Payment Status

| Plan | Price (INR) | Period | How it starts |
|---|---:|---|---|
| Free Trial | ₹0 | exactly 24 hours | `start_free_trial()`: instantly, once per account |
| Monthly | ₹199 | 1 calendar month | `request_subscription('monthly')` → **pending** → active only after verified payment |
| Yearly | ₹1,299 | 1 calendar year | `request_subscription('yearly')` → **pending** → active only after verified payment |

Yearly saves ₹1,089 compared with 12 × ₹199.

## 1. Apply the migration (manual, SQL Editor)

File: `supabase/migrations/20261119000000_membership_plans.sql`. It is additive, safe to re-run, and does not modify existing rows.

**Before applying**, check that no account already has more than one trial row (the new one-trial index would fail):

```sql
SELECT user_id, count(*) FROM public.subscriptions WHERE plan = 'trial' GROUP BY user_id HAVING count(*) > 1;
```

Expected: no rows (the migration also checks this, plus duplicate active rows, and stops with a clear message without changing data). Then paste and run the migration file as the default `postgres` role (it becomes the function owner).

**After applying**, verify:

```sql
-- prices/durations
SELECT p, t.* FROM unnest(array['trial','monthly','yearly']) p, LATERAL public.zc_plan_terms(p) t;
-- browser role can no longer insert directly; RPCs are callable
SELECT has_table_privilege('authenticated', 'public.subscriptions', 'INSERT')  AS browser_can_insert,   -- false
       has_function_privilege('authenticated', 'public.start_free_trial()', 'EXECUTE') AS can_start_trial, -- true
       has_function_privilege('authenticated', 'public.activate_subscription(uuid,text,numeric,text)', 'EXECUTE') AS browser_can_activate; -- false
```

**Order matters:** the updated app calls the new RPCs. Apply the migration **before** deploying this version of the frontend. Otherwise "Start free trial" and "Continue to payment" will fail on the live site.

## 2. Security model

- Prices and durations exist **only** in `zc_plan_terms()` in the database. The browser sends just the plan name; it never sends an amount, an expiry, a status or a user id.
- Identity comes from `auth.uid()` in every function.
- **Trial once:** a unique index on `(user_id) WHERE plan = 'trial'` covers every trial ever started, so an expired trial can't be restarted, and two parallel requests can't both succeed.
- **No self-activation:** the browser role has no INSERT/UPDATE on `subscriptions`. `activate_subscription()` is executable only by `service_role` and rejects wrong amounts, missing payment references and non-pending rows.
- **Access** = an `active` or `trial` row whose `period_end` is in the future. `pending`, `cancelled`, `expired` and lapsed rows never grant access, even if no job has flipped their status yet.
- RLS on `subscriptions` is unchanged: users see only their own rows. Browser roles keep SELECT only; every table- and column-level write grant is revoked.
- **Concurrency:** every function that changes a user's subscriptions takes a per-user transaction lock, so simultaneous requests return one pending row, simultaneous trial starts create one trial, and simultaneous activations run one after another.
- **Activation:** `activate_subscription(subscription_id, payment_reference, amount_paid, currency DEFAULT 'INR')` is SECURITY INVOKER and executable only by `service_role`. It requires a pending paid row, the exact server price in INR, and a payment reference not used by any other subscription. Re-delivering the same payment returns the already-active row (safe webhook retries).
- All functions use `search_path = ''` with fully qualified names; only `start_free_trial` and `request_subscription` are SECURITY DEFINER.
- Database tests: `supabase/tests/membership_plans.db-test.mjs` (real PostgreSQL 17, parallel connections; see the header for how to run).

## 3. Payment integration (not built)

ZCare has **no payment gateway**. Choosing Monthly or Yearly records a **pending** request and tells the user that nothing was charged and the plan is not active.

To go live you need, for example with Razorpay:

1. A Supabase **Edge Function** `create-order` that calls `request_subscription` as the user, then creates a Razorpay order for the **row's `amount`** (from the database, never from the browser) and returns the order id.
2. Razorpay Checkout in the Plans page with that order id.
3. A **webhook / verify** Edge Function that checks the Razorpay signature with the key secret (stored as an Edge Function secret, never in the frontend), and that the payment is captured, then calls `activate_subscription(subscription_id, razorpay_payment_id, amount_paid_in_rupees, 'INR')` with the service-role key. The database cannot see the gateway, so this verification step is what makes activation trustworthy; never activate from the browser.
4. Optional: schedule `select public.expire_lapsed_subscriptions();` daily with pg_cron (housekeeping only; access is already time-checked).

## 4. Premium features

The app currently has **no feature locked behind a subscription**. Every signed-in user can use everything, as before. `getMembership()` / `get_my_access()` return `hasAccess`, ready for gating once you decide which features are premium.

## 5. Local / demo mode

Without Supabase (offline mode) the same rules run in the browser's localStorage: one trial per local account, and paid plans stay pending. This is **not tamper-proof** and is only for local development. The demo account shows a sample active Yearly plan at ₹1,299.
