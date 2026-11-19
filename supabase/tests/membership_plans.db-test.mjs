// Run (needs no Supabase project; installs a local PostgreSQL 17 binary, ~100 MB):
//   npm install --no-save embedded-postgres@17.5.0-beta.15 pg@8.16.3
//   node supabase/tests/membership_plans.db-test.mjs
//
// Membership migration review tests on a REAL PostgreSQL 17 server (embedded-postgres),
// with parallel connections for the concurrency tests. Supabase's auth schema and
// API roles are stubbed. Nothing here touches the hosted Supabase project.
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const MIG = fileURLToPath(new URL('../migrations/', import.meta.url));
const MEMBERSHIP = '20261119000000_membership_plans.sql';
const DIR = join(tmpdir(), 'zcare-membership-pgdata');
const PORT = 54329;
rmSync(DIR, { recursive: true, force: true });

const server = new EmbeddedPostgres({ databaseDir: DIR, user: 'postgres', password: 'local-test-only', port: PORT, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} });
await server.initialise();
await server.start();

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};
const section = t => console.log(`\n=== ${t} ===`);
const conn = db => ({ host: 'localhost', port: PORT, user: 'postgres', password: 'local-test-only', database: db });

const STUBS = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  END $$;
  CREATE SCHEMA auth; CREATE SCHEMA storage;
  CREATE TABLE auth.users (id UUID PRIMARY KEY, email TEXT);
  CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE TABLE storage.buckets (id TEXT PRIMARY KEY, name TEXT, public BOOLEAN, file_size_limit BIGINT, allowed_mime_types TEXT[]);
  CREATE TABLE storage.objects (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id TEXT, name TEXT, owner UUID);
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  CREATE FUNCTION storage.foldername(name TEXT) RETURNS TEXT[] LANGUAGE sql AS $$ SELECT string_to_array(name, '/') $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
  -- Supabase grants EXECUTE on new public functions to the API roles by default.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
`;
const migrationSql = f => readFileSync(join(MIG, f), 'utf8');
const migrations = () => readdirSync(MIG).filter(f => f.endsWith('.sql')).sort();

/** Fresh database with every migration before the membership one applied. */
async function freshDb(name) {
  const admin = new pg.Client(conn('postgres'));
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${name}`);
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  const c = new pg.Client(conn(name));
  await c.connect();
  await c.query(STUBS);
  for (const f of migrations().filter(f => f < MEMBERSHIP)) await c.query(migrationSql(f));
  return c;
}

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const C = 'cccccccc-0000-4000-8000-000000000003';
const D = 'dddddddd-0000-4000-8000-000000000004';
const E = 'eeeeeeee-0000-4000-8000-000000000005';
const F = 'ffffffff-0000-4000-8000-000000000006';

const pool = new pg.Pool({ ...conn('zc_main'), max: 30 });
const errOf = p => p.then(() => null, e => e.message);
/** One transaction as a browser user (role authenticated + JWT sub). Optional hold keeps it open. */
async function asUser(uid, sql, params = [], holdSeconds = 0) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SET LOCAL ROLE authenticated');
    await c.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid ?? '']);
    const r = await c.query(sql, params);
    if (holdSeconds) await c.query('SELECT pg_sleep($1)', [holdSeconds]);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
async function asRole(role, sql, params = [], holdSeconds = 0) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(`SET LOCAL ROLE ${role}`);
    const r = await c.query(sql, params);
    if (holdSeconds) await c.query('SELECT pg_sleep($1)', [holdSeconds]);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
const q = async (sql, params) => (await pool.query(sql, params)).rows;

try {
  // ------------------------------------------------------------------
  section('Setup: legacy data, then apply the membership migration');
  const main = await freshDb('zc_main');
  await main.query(`INSERT INTO auth.users VALUES ('${A}','a@t'),('${B}','b@t'),('${C}','c@t'),('${D}','d@t'),('${E}','e@t'),('${F}','f@t')`);
  // Legacy rows as the old app could create them: client-priced pending duplicates, an old active plan.
  await main.query(`INSERT INTO public.subscriptions (user_id, plan, status, amount, currency, provider_reference, period_start, period_end, created_at) VALUES
    ('${C}', 'yearly',  'active',  1050, 'INR', 'OLD-REF-1', '2026-06-01', '2027-06-01', '2026-06-01'),
    ('${E}', 'monthly', 'pending', 100,  'INR', NULL,        '2026-10-01', '2026-11-01', '2026-10-01'),
    ('${E}', 'monthly', 'pending', 100,  'INR', NULL,        '2026-10-02', '2026-11-02', '2026-10-02')`);
  // A column-level browser write grant that a table-level REVOKE alone might be expected to miss.
  await main.query(`GRANT UPDATE (status, period_end) ON public.subscriptions TO authenticated`);
  const before = await main.query(`SELECT * FROM public.subscriptions ORDER BY id`);
  await main.query(migrationSql(MEMBERSHIP));
  check('Membership migration applies on top of the 4 existing migrations', true);
  await main.query(migrationSql(MEMBERSHIP));
  check('Membership migration is safe to re-run', true);
  const after = await main.query(`SELECT * FROM public.subscriptions ORDER BY id`);
  check('Existing subscription rows are byte-for-byte unchanged by the migration', JSON.stringify(before.rows) === JSON.stringify(after.rows), `${after.rows.length} rows`);
  await main.end();

  // ------------------------------------------------------------------
  section('1. Browser write privileges on subscriptions');
  const priv = await q(`SELECT r, p, has_table_privilege(r, 'public.subscriptions', p) AS ok
    FROM unnest(array['anon','authenticated']) r, unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p`);
  const allowed = priv.filter(x => x.ok).map(x => `${x.r}:${x.p}`);
  check('anon has no privileges; authenticated has SELECT only', JSON.stringify(allowed) === JSON.stringify(['authenticated:SELECT']), allowed.join(', '));
  const colWrites = await q(`SELECT grantee, privilege_type, column_name FROM information_schema.column_privileges
    WHERE table_schema='public' AND table_name='subscriptions' AND grantee IN ('anon','authenticated','PUBLIC') AND privilege_type IN ('INSERT','UPDATE','REFERENCES')`);
  check('No column-level write grants remain (the injected UPDATE(status, period_end) was removed)', colWrites.length === 0, JSON.stringify(colWrites));
  for (const [label, sql] of [
    ['INSERT', `INSERT INTO public.subscriptions (user_id, plan, status, amount, period_end) VALUES ('${A}','yearly','active',1, now() + interval '1 year')`],
    ['UPDATE', `UPDATE public.subscriptions SET status='active', period_end = now() + interval '9 years' WHERE user_id='${A}'`],
    ['UPDATE (column)', `UPDATE public.subscriptions SET period_end = now() + interval '9 years' WHERE user_id='${A}'`],
    ['DELETE', `DELETE FROM public.subscriptions WHERE user_id='${A}'`],
  ]) {
    const e = await errOf(asUser(A, sql));
    check(`Browser ${label} on subscriptions is denied`, /permission denied/i.test(e ?? ''), e ?? 'no error');
  }
  check('RLS still enabled on subscriptions', (await q(`SELECT relrowsecurity FROM pg_class WHERE oid='public.subscriptions'::regclass`))[0].relrowsecurity === true);
  const seenByC = (await asUser(C, `SELECT DISTINCT user_id FROM public.subscriptions`)).rows.map(r => r.user_id);
  check('Users still read only their own rows', seenByC.length === 1 && seenByC[0] === C, JSON.stringify(seenByC));

  // ------------------------------------------------------------------
  section('2. uq_subscriptions_one_active_per_user');
  const idx = await q(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename='subscriptions' AND indexname IN ('uq_subscriptions_one_active_per_user','uq_subscriptions_one_trial_per_user','uq_subscriptions_provider_reference') ORDER BY 1`);
  check('one-active, one-trial and payment-reference unique indexes exist', idx.length === 3, idx.map(i => i.indexname).join(', '));
  {
    const c2 = await freshDb('zc_noidx');
    await c2.query(`DROP INDEX public.uq_subscriptions_one_active_per_user`);
    await c2.query(migrationSql(MEMBERSHIP));
    const r = await c2.query(`SELECT 1 FROM pg_indexes WHERE indexname='uq_subscriptions_one_active_per_user'`);
    check('If the one-active index is missing, the migration creates it', r.rowCount === 1);
    await c2.end();
  }
  {
    const c3 = await freshDb('zc_dupactive');
    await c3.query(`DROP INDEX public.uq_subscriptions_one_active_per_user`);
    await c3.query(`INSERT INTO auth.users VALUES ('${A}','a@t')`);
    await c3.query(`INSERT INTO public.subscriptions (user_id, plan, status, amount, period_end) VALUES ('${A}','monthly','active',199, now()+interval '1 month'),('${A}','yearly','active',1299, now()+interval '1 year')`);
    const e = await errOf(c3.query(migrationSql(MEMBERSHIP)));
    check('Duplicate active rows: migration stops with a clear message (no data changed)', /several active rows/.test(e ?? ''), e ?? 'no error');
    check('…and the duplicate rows are left as they were', (await c3.query(`SELECT count(*)::int n FROM public.subscriptions WHERE status='active'`)).rows[0].n === 2);
    await c3.end();
  }
  {
    const c4 = await freshDb('zc_duptrial');
    await c4.query(`INSERT INTO auth.users VALUES ('${A}','a@t')`);
    await c4.query(`INSERT INTO public.subscriptions (user_id, plan, status, amount, period_end) VALUES ('${A}','trial','expired',0, now() + interval '1 day'),('${A}','trial','expired',0, now() + interval '1 day')`);
    const e = await errOf(c4.query(migrationSql(MEMBERSHIP)));
    check('Duplicate trial rows: migration stops with a clear message', /several trial rows/.test(e ?? ''), e ?? 'no error');
    await c4.end();
  }
  {
    const c5 = await freshDb('zc_dupref');
    await c5.query(`INSERT INTO auth.users VALUES ('${A}','a@t'),('${B}','b@t')`);
    await c5.query(`INSERT INTO public.subscriptions (user_id, plan, status, amount, provider_reference, period_end) VALUES ('${A}','monthly','expired',100,'SAME',now() + interval '1 day'),('${B}','monthly','expired',100,'SAME',now() + interval '1 day')`);
    const e = await errOf(c5.query(migrationSql(MEMBERSHIP)));
    const has = (await c5.query(`SELECT 1 FROM pg_indexes WHERE indexname='uq_subscriptions_provider_reference'`)).rowCount;
    check('Legacy rows sharing a payment reference: migration still applies, index skipped (function check remains)', e === null && has === 0, e ?? '');
    await c5.end();
  }

  // ------------------------------------------------------------------
  section('3. Simultaneous request_subscription() calls');
  {
    // Control: the same logic WITHOUT the per-user lock, as in the first draft of this migration.
    await pool.query(`CREATE FUNCTION public.zz_request_without_lock(p_plan TEXT) RETURNS public.subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
      DECLARE v_row public.subscriptions; BEGIN
        SELECT * INTO v_row FROM public.subscriptions s WHERE s.user_id = auth.uid() AND s.plan = p_plan AND s.status = 'pending' LIMIT 1;
        IF FOUND THEN RETURN v_row; END IF;
        INSERT INTO public.subscriptions (user_id, plan, status, amount, period_end) VALUES (auth.uid(), p_plan, 'pending', 199, pg_catalog.now() + interval '1 month') RETURNING * INTO v_row;
        RETURN v_row; END $$;
      GRANT EXECUTE ON FUNCTION public.zz_request_without_lock(TEXT) TO authenticated;`);
    await Promise.all(Array.from({ length: 10 }, () => asUser(F, `SELECT * FROM public.zz_request_without_lock('monthly')`, [], 0.3)));
    const dupes = (await q(`SELECT count(*)::int n FROM public.subscriptions WHERE user_id='${F}' AND status='pending'`))[0].n;
    check('Control: without the lock, 10 simultaneous requests create duplicate pending rows (race is real)', dupes > 1, `${dupes} rows`);
    await pool.query(`DROP FUNCTION public.zz_request_without_lock(TEXT); DELETE FROM public.subscriptions WHERE user_id='${F}';`);

    const res = await Promise.all(Array.from({ length: 20 }, () => asUser(B, `SELECT * FROM public.request_subscription('monthly')`, [], 0.3)));
    const ids = new Set(res.map(r => r.rows[0].id));
    const n = (await q(`SELECT count(*)::int n FROM public.subscriptions WHERE user_id='${B}' AND plan='monthly' AND status='pending'`))[0].n;
    check('20 simultaneous requests (each transaction held open 0.3 s) create exactly ONE pending row', n === 1 && ids.size === 1, `${n} row(s), ${ids.size} distinct id(s)`);
    const mixed = await Promise.all(['monthly', 'yearly', 'monthly', 'yearly', 'monthly', 'yearly'].map(p => asUser(D, `SELECT * FROM public.request_subscription($1)`, [p], 0.2)));
    const perPlan = await q(`SELECT plan, count(*)::int n FROM public.subscriptions WHERE user_id='${D}' AND status='pending' GROUP BY plan ORDER BY plan`);
    check('Simultaneous monthly + yearly requests: one pending row per plan', JSON.stringify(perPlan) === JSON.stringify([{ plan: 'monthly', n: 1 }, { plan: 'yearly', n: 1 }]), JSON.stringify(perPlan) + ` (${mixed.length} calls)`);
    const p = res[0].rows[0];
    check('Pending row uses the server price (₹199), not anything from the browser', Number(p.amount) === 199 && p.currency === 'INR');
  }
  {
    const trials = await Promise.all(Array.from({ length: 12 }, () => errOf(asUser(A, `SELECT * FROM public.start_free_trial()`, [], 0.2))));
    const ok = trials.filter(e => e === null).length;
    const refused = trials.filter(e => /trial_already_used/.test(e ?? '')).length;
    const rows = (await q(`SELECT count(*)::int n FROM public.subscriptions WHERE user_id='${A}' AND plan='trial'`))[0].n;
    check('12 simultaneous trial starts: exactly 1 succeeds, 11 get "trial_already_used", 1 row', ok === 1 && refused === 11 && rows === 1, `${ok} ok / ${refused} refused / ${rows} row`);
  }

  // ------------------------------------------------------------------
  section('4. NULL and invalid plan names');
  for (const [label, plan] of [['NULL', null], ['empty string', ''], ['"Monthly" (wrong case)', 'Monthly'], ['"trial"', 'trial'], ['"lifetime"', 'lifetime'], ['" monthly" (space)', ' monthly'], ["SQL-ish text", "monthly'; --"]]) {
    const e = await errOf(asUser(B, `SELECT * FROM public.request_subscription($1)`, [plan]));
    check(`request_subscription(${label}) is rejected`, /invalid_plan/.test(e ?? ''), e ?? 'no error');
  }
  check('No rows were created by the rejected calls', (await q(`SELECT count(*)::int n FROM public.subscriptions WHERE user_id='${B}'`))[0].n === 1);
  const unauth = await errOf(asUser(null, `SELECT * FROM public.request_subscription('monthly')`));
  check('Call without a signed-in user (no JWT sub) is rejected', /not_authenticated/.test(unauth ?? ''), unauth ?? '');

  // ------------------------------------------------------------------
  section('5. Simultaneous payment activation');
  const pendM = (await asUser(B, `SELECT * FROM public.request_subscription('monthly')`)).rows[0];
  const pendY = (await asUser(B, `SELECT * FROM public.request_subscription('yearly')`)).rows[0];
  {
    // Same subscription, same payment delivered 8 times at once (webhook retries).
    const r = await Promise.all(Array.from({ length: 8 }, () => errOf(asRole('service_role', `SELECT * FROM public.activate_subscription($1, 'pay_M1', 199)`, [pendM.id], 0.2))));
    const row = (await q(`SELECT status, provider_reference, period_start, period_end FROM public.subscriptions WHERE id=$1`, [pendM.id]))[0];
    check('8 simultaneous deliveries of the same payment: all succeed idempotently, activated once', r.every(e => e === null) && row.status === 'active' && row.provider_reference === 'pay_M1', r.filter(Boolean).join('; '));
    const exact = (await q(`SELECT ($1::timestamptz + interval '1 month') = $2::timestamptz ok`, [row.period_start, row.period_end]))[0].ok;
    check('…with exactly one calendar month', exact === true);
  }
  {
    // Two different paid subscriptions of the same user activated at the same moment.
    const pM2 = (await asUser(D, `SELECT * FROM public.subscriptions WHERE user_id = auth.uid() AND plan='monthly' AND status='pending'`)).rows[0];
    const pY2 = (await asUser(D, `SELECT * FROM public.subscriptions WHERE user_id = auth.uid() AND plan='yearly' AND status='pending'`)).rows[0];
    const r = await Promise.all([
      errOf(asRole('service_role', `SELECT * FROM public.activate_subscription($1, 'pay_D_M', 199)`, [pM2.id], 0.3)),
      errOf(asRole('service_role', `SELECT * FROM public.activate_subscription($1, 'pay_D_Y', 1299)`, [pY2.id], 0.3)),
    ]);
    const rows = await q(`SELECT plan, status, period_start, period_end FROM public.subscriptions WHERE user_id='${D}' AND plan IN ('monthly','yearly') ORDER BY period_start`);
    const active = rows.filter(x => x.status === 'active');
    check('Two different payments activated simultaneously: both succeed, no unique-index error', r.every(e => e === null), r.filter(Boolean).join('; '));
    check('…exactly one active row remains, and it starts when the other plan ends (no lost time)',
      active.length === 1 && rows.length === 2 && new Date(rows[1].period_start).getTime() === new Date(rows[0].period_end).getTime(),
      rows.map(x => `${x.plan}:${x.status}`).join(', '));
    const acc = (await asUser(D, `SELECT * FROM public.get_my_access()`)).rows[0];
    check('…and the user keeps continuous access', acc.has_access === true && new Date(acc.period_end).getTime() === Math.max(...rows.map(x => new Date(x.period_end).getTime())));
  }
  {
    // One payment reference used for two different subscriptions at the same time.
    const pX = (await asUser(F, `SELECT * FROM public.request_subscription('monthly')`)).rows[0];
    const r = await Promise.all([
      errOf(asRole('service_role', `SELECT * FROM public.activate_subscription($1, 'pay_SHARED', 1299)`, [pendY.id], 0.3)),
      errOf(asRole('service_role', `SELECT * FROM public.activate_subscription($1, 'pay_SHARED', 199)`, [pX.id], 0.3)),
    ]);
    const used = (await q(`SELECT count(*)::int n FROM public.subscriptions WHERE provider_reference='pay_SHARED'`))[0].n;
    check('Same payment reference for two subscriptions at once: only one activation succeeds', r.filter(e => e === null).length === 1 && used === 1 && r.some(e => /payment_reference_already_used/.test(e ?? '')), r.map(e => e ?? 'ok').join(' | '));
  }

  // ------------------------------------------------------------------
  section('6 + 8. Who can activate, and what activation requires');
  const fx = await q(`SELECT f, r, has_function_privilege(r, f, 'EXECUTE') ok FROM
    unnest(array['public.activate_subscription(uuid,text,numeric,text)','public.expire_lapsed_subscriptions()','public.zc_lock_user_subscriptions(uuid)']) f,
    unnest(array['anon','authenticated','service_role']) r ORDER BY 1,2`);
  const fxAllowed = fx.filter(x => x.ok).map(x => `${x.f.split('(')[0].replace('public.', '')}:${x.r}`);
  check('Only service_role can execute activate / expire / lock functions', fxAllowed.every(s => s.endsWith(':service_role')) && fxAllowed.length === 3, fxAllowed.join(', '));
  const pub = await q(`SELECT p.proname, a.grantee FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    WHERE p.pronamespace='public'::regnamespace AND p.proname IN ('activate_subscription','start_free_trial','request_subscription','get_my_access','expire_lapsed_subscriptions','zc_plan_terms','zc_lock_user_subscriptions') AND a.grantee = 0`);
  check('No membership function is executable by PUBLIC', pub.length === 0, JSON.stringify(pub));
  const browserFx = await q(`SELECT f, has_function_privilege('authenticated', f, 'EXECUTE') a, has_function_privilege('anon', f, 'EXECUTE') n FROM
    unnest(array['public.start_free_trial()','public.request_subscription(text)','public.get_my_access()']) f`);
  check('Signed-in users can call start_free_trial / request_subscription / get_my_access; anon cannot', browserFx.every(x => x.a && !x.n));
  for (const [role, uid] of [['authenticated', B], ['anon', null]]) {
    const e = await errOf(uid ? asUser(uid, `SELECT * FROM public.activate_subscription($1,'pay_X',1299)`, [pendY.id]) : asRole(role, `SELECT * FROM public.activate_subscription($1,'pay_X',1299)`, [pendY.id]));
    check(`${role} calling activate_subscription() is denied`, /permission denied/i.test(e ?? ''), e ?? 'no error');
  }
  const G = '99999999-0000-4000-8000-000000000007';
  await pool.query("INSERT INTO auth.users VALUES ('" + G + "','g@t')");
  const pendG = (await asUser(G, `SELECT * FROM public.request_subscription('yearly')`)).rows[0];
  const svc = async (args, params) => errOf(asRole('service_role', `SELECT * FROM public.activate_subscription(${args})`, params));
  check('Activation requires a payment reference', /missing_payment_reference/.test(await svc(`$1, '  ', 1299`, [pendG.id])));
  check('Activation requires the exact amount (₹1,298 rejected)', /amount_mismatch/.test(await svc(`$1, 'pay_Y', 1298`, [pendG.id])));
  check('Activation rejects a NULL amount', /amount_mismatch/.test(await svc(`$1, 'pay_Y', NULL`, [pendG.id])));
  check('Activation rejects a non-INR currency', /currency_mismatch/.test(await svc(`$1, 'pay_Y', 1299, 'USD'`, [pendG.id])));
  check('Activation rejects an unknown subscription', /subscription_not_found/.test(await svc(`gen_random_uuid(), 'pay_Y', 1299`, [])));
  const trialId = (await q(`SELECT id FROM public.subscriptions WHERE user_id='${A}' AND plan='trial'`))[0].id;
  check('A trial row can never be "activated" as paid', /subscription_not_pending/.test(await svc(`$1, 'pay_T', 0`, [trialId])));
  check('A legacy client-priced pending row (₹100) cannot be activated with ₹100', /amount_mismatch/.test(await svc(`(SELECT id FROM public.subscriptions WHERE user_id='${E}' LIMIT 1), 'pay_E', 100`, [])));
  check('A different payment cannot re-activate an already active subscription', /subscription_not_pending/.test(await svc(`$1, 'pay_OTHER', 199`, [pendM.id])));
  const pendingAccess = (await asUser(E, `SELECT * FROM public.get_my_access()`)).rows[0];
  check('…and the rejected attempts left the row pending', (await q(`SELECT status FROM public.subscriptions WHERE id=$1`, [pendG.id]))[0].status === 'pending');
  check('Pending rows never grant access', pendingAccess.has_access === false && pendingAccess.pending_plan === 'monthly');

  // ------------------------------------------------------------------
  section('7. SECURITY DEFINER, search_path, ownership');
  const fns = await q(`SELECT p.proname, p.prosecdef, pg_get_userbyid(p.proowner) owner, p.proconfig
    FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
      AND p.proname IN ('activate_subscription','start_free_trial','request_subscription','get_my_access','expire_lapsed_subscriptions','zc_plan_terms','zc_lock_user_subscriptions') ORDER BY 1`);
  const definers = fns.filter(f => f.prosecdef).map(f => f.proname).sort();
  check('SECURITY DEFINER only on start_free_trial and request_subscription', JSON.stringify(definers) === JSON.stringify(['request_subscription', 'start_free_trial']), definers.join(', '));
  check('Every function pins search_path to empty', fns.every(f => (f.proconfig ?? []).includes('search_path=""')), fns.map(f => `${f.proname}:${f.proconfig}`).join(' '));
  check('All functions owned by the migration owner (postgres)', fns.every(f => f.owner === 'postgres'), [...new Set(fns.map(f => f.owner))].join(','));
  check('Only one activate_subscription signature exists (no stale overload)', (await q(`SELECT count(*)::int n FROM pg_proc WHERE proname='activate_subscription'`))[0].n === 1);
  {
    // search_path hijack attempt: a caller-controlled schema with a fake "subscriptions" table first in the path.
    await pool.query(`CREATE SCHEMA evil; CREATE TABLE evil.subscriptions (LIKE public.subscriptions INCLUDING DEFAULTS); GRANT USAGE ON SCHEMA evil TO authenticated; GRANT ALL ON evil.subscriptions TO authenticated;
      CREATE FUNCTION evil.now() RETURNS timestamptz LANGUAGE sql AS $$ SELECT '2099-01-01'::timestamptz $$; GRANT EXECUTE ON FUNCTION evil.now() TO authenticated;`);
    const c = await pool.connect();
    await c.query('BEGIN');
    await c.query('SET LOCAL ROLE authenticated');
    await c.query(`SET LOCAL search_path = evil, public, pg_catalog`);
    await c.query(`SELECT set_config('request.jwt.claim.sub', '${C}', true)`);
    const row = (await c.query(`SELECT * FROM public.request_subscription('monthly')`)).rows[0];
    await c.query('COMMIT');
    c.release();
    const inEvil = (await q(`SELECT count(*)::int n FROM evil.subscriptions`))[0].n;
    const inPublic = (await q(`SELECT count(*)::int n FROM public.subscriptions WHERE id=$1`, [row.id]))[0].n;
    check("A caller's search_path cannot redirect the definer function to other tables/functions", inEvil === 0 && inPublic === 1 && new Date(row.period_start).getUTCFullYear() < 2099);
    await pool.query(`DROP SCHEMA evil CASCADE`);
  }

  // ------------------------------------------------------------------
  section('Existing data after all tests');
  const legacy = await q(`SELECT user_id, plan, status, amount::int a, provider_reference FROM public.subscriptions WHERE user_id IN ('${C}','${E}') AND created_at < '2026-11-01' ORDER BY created_at`);
  check('Legacy rows (old ₹1,050 active plan, ₹100 pending requests) still unchanged', JSON.stringify(legacy.map(r => `${r.plan}:${r.status}:${r.a}:${r.provider_reference}`)) === JSON.stringify(['yearly:active:1050:OLD-REF-1', 'monthly:pending:100:null', 'monthly:pending:100:null']), legacy.map(r => `${r.plan}:${r.status}:${r.a}`).join(', '));
  check('Legacy active subscriber keeps access', (await asUser(C, `SELECT * FROM public.get_my_access()`)).rows[0].has_access === true);
} catch (e) {
  check('TEST ERROR', false, e.stack?.split('\n').slice(0, 3).join(' | '));
} finally {
  await pool.end().catch(() => {});
  await server.stop();
  rmSync(DIR, { recursive: true, force: true });
}
console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
