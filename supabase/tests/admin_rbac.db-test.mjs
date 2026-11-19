// Admin / RBAC migration tests on a REAL PostgreSQL 17 server (embedded-postgres).
// Run (no Supabase project needed; downloads a local PostgreSQL binary, ~100 MB):
//   npm install --no-save embedded-postgres@17.5.0-beta.15 pg@8.16.3
//   node supabase/tests/admin_rbac.db-test.mjs
// Supabase's auth schema and API roles are stubbed. Nothing touches the hosted project.
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIG = join(ROOT, 'migrations');
const ROLLBACK = join(ROOT, 'rollbacks', '20261120000000_admin_rbac.down.sql');
const ADMIN = '20261120000000_admin_rbac.sql';
const DIR = join(tmpdir(), 'zcare-admin-pgdata');
const PORT = 54331;
rmSync(DIR, { recursive: true, force: true });
const server = new EmbeddedPostgres({ databaseDir: DIR, user: 'postgres', password: 'local-test-only', port: PORT, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} });
await server.initialise();
await server.start();

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`); };
const section = t => console.log(`\n=== ${t} ===`);
const conn = db => ({ host: 'localhost', port: PORT, user: 'postgres', password: 'local-test-only', database: db });

const STUBS = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  END $$;
  CREATE SCHEMA auth; CREATE SCHEMA storage;
  CREATE TABLE auth.users (id UUID PRIMARY KEY, email TEXT, created_at TIMESTAMPTZ DEFAULT now(), last_sign_in_at TIMESTAMPTZ, email_confirmed_at TIMESTAMPTZ);
  CREATE TABLE auth.identities (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, provider TEXT);
  CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE TABLE storage.buckets (id TEXT PRIMARY KEY, name TEXT, public BOOLEAN, file_size_limit BIGINT, allowed_mime_types TEXT[]);
  CREATE TABLE storage.objects (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id TEXT, name TEXT, owner UUID);
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  CREATE FUNCTION storage.foldername(name TEXT) RETURNS TEXT[] LANGUAGE sql AS $$ SELECT string_to_array(name, '/') $$;
  GRANT USAGE ON SCHEMA auth, storage TO anon, authenticated, service_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
  GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
`;
const sqlOf = f => readFileSync(join(MIG, f), 'utf8');

const admin = new pg.Client(conn('postgres'));
await admin.connect();
await admin.query('CREATE DATABASE zc_admin');
await admin.end();
const db = new pg.Client(conn('zc_admin'));
await db.connect();
const pool = new pg.Pool({ ...conn('zc_admin'), max: 10 });
const errOf = p => p.then(() => null, e => e.message);
async function as(role, uid, sql, params = []) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(`SET LOCAL ROLE ${role}`);
    if (uid) await c.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid]);
    const r = await c.query(sql, params);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
const user = (uid, sql, params) => as('authenticated', uid, sql, params);
const q = async (sql, params) => (await pool.query(sql, params)).rows;

const SA = '5a000000-0000-4000-8000-000000000001';
const AD = 'ad000000-0000-4000-8000-000000000002';
const U1 = '01000000-0000-4000-8000-000000000003';
const U2 = '02000000-0000-4000-8000-000000000004';
const U3 = '03000000-0000-4000-8000-000000000005';

try {
  section('Setup: all existing migrations + realistic data, then the admin migration');
  await db.query(STUBS);
  for (const f of readdirSync(MIG).filter(f => f.endsWith('.sql') && f < ADMIN).sort()) await db.query(sqlOf(f));
  await db.query(`INSERT INTO auth.users (id, email, created_at, last_sign_in_at, email_confirmed_at) VALUES
    ('${SA}', 'owner@client.test', now() - interval '90 days', now() - interval '1 day', now()),
    ('${AD}', 'staff@client.test', now() - interval '60 days', now() - interval '2 days', now()),
    ('${U1}', 'asha@example.test', now() - interval '20 days', now() - interval '3 days', now()),
    ('${U2}', 'ravi@example.test', now() - interval '10 days', now() - interval '45 days', now()),
    ('${U3}', 'pending@example.test', now() - interval '1 day', NULL, NULL)`);
  await db.query(`INSERT INTO auth.identities (user_id, provider) VALUES ('${U1}','email'),('${U2}','google')`);
  await db.query(`INSERT INTO public.profiles (user_id, full_name, date_of_birth, gender) VALUES ('${U1}','Asha Menon','1990-01-01','female'),('${U2}','Ravi Kumar','1985-05-05','male')`);
  await db.query(`INSERT INTO public.medications (user_id, name, status) VALUES ('${U1}','SecretMedA','active'),('${U2}','SecretMedB','active')`);
  await db.query(`INSERT INTO public.allergies (user_id, allergen, severity) VALUES ('${U2}','SecretAllergen','severe')`);
  const before = JSON.stringify((await db.query(`SELECT (SELECT json_agg(t ORDER BY id) FROM public.medications t) m, (SELECT json_agg(t ORDER BY id) FROM public.profiles t) p, (SELECT json_agg(p ORDER BY policyname) FROM pg_policies p WHERE policyname NOT LIKE 'zc_account_active%') pol`)).rows[0]);
  await db.query(sqlOf(ADMIN));
  check('Admin migration applies on top of all 5 existing migrations', true);
  await db.query(sqlOf(ADMIN));
  check('Admin migration is safe to re-run', true);
  const after = JSON.stringify((await db.query(`SELECT (SELECT json_agg(t ORDER BY id) FROM public.medications t) m, (SELECT json_agg(t ORDER BY id) FROM public.profiles t) p, (SELECT json_agg(p ORDER BY policyname) FROM pg_policies p WHERE policyname NOT LIKE 'zc_account_active%') pol`)).rows[0]);
  check('Existing data and every existing policy are unchanged', before === after);

  // Subscriptions through the real membership functions.
  await user(U1, `SELECT * FROM public.start_free_trial()`);
  const pendM = (await user(U2, `SELECT * FROM public.request_subscription('monthly')`)).rows[0];
  const pendY = (await user(U2, `SELECT * FROM public.request_subscription('yearly')`)).rows[0];
  await as('service_role', null, `SELECT * FROM public.activate_subscription($1, 'pay_Y_1', 1299)`, [pendY.id]);
  await db.query(`INSERT INTO public.subscriptions (user_id, plan, status, amount, period_start, period_end) VALUES ('${U3}','monthly','active',199, now() - interval '40 days', now() - interval '10 days')`);

  section('Super Admin bootstrap');
  const bootBrowser = await errOf(user(U1, `SELECT public.zc_bootstrap_super_admin('asha@example.test')`));
  check('A signed-in user cannot call the bootstrap procedure', /permission denied/i.test(bootBrowser ?? ''), bootBrowser ?? 'no error');
  check('Bootstrap rejects an unknown email', /user_not_found/.test(await errOf(db.query(`SELECT public.zc_bootstrap_super_admin('nobody@x.test')`))));
  check('Bootstrap rejects an unconfirmed email', /email_not_confirmed/.test(await errOf(db.query(`SELECT public.zc_bootstrap_super_admin('pending@example.test')`))));
  await db.query(`SELECT public.zc_bootstrap_super_admin('OWNER@client.test')`);
  check('Bootstrap (SQL Editor) makes the client account Super Admin (email case-insensitive)', (await q(`SELECT role FROM public.app_admins WHERE user_id=$1`, [SA]))[0]?.role === 'super_admin');
  check('A second bootstrap is refused', /super_admin_exists/.test(await errOf(db.query(`SELECT public.zc_bootstrap_super_admin('staff@client.test')`))));
  check('zc_my_admin_role(): super_admin for the owner, NULL for a regular user',
    (await user(SA, `SELECT public.zc_my_admin_role() r`)).rows[0].r === 'super_admin' && (await user(U1, `SELECT public.zc_my_admin_role() r`)).rows[0].r === null);

  section('Privilege escalation attempts by a regular user');
  for (const [label, sql] of [
    ['insert itself into app_admins', `INSERT INTO public.app_admins (user_id, role) VALUES ('${U1}', 'super_admin')`],
    ['read app_admins', `SELECT * FROM public.app_admins`],
    ['update account_status', `INSERT INTO public.account_status (user_id, status) VALUES ('${U2}', 'suspended')`],
    ['write the audit log', `INSERT INTO public.admin_audit_log (action) VALUES ('fake')`],
    ['read the audit log table', `SELECT * FROM public.admin_audit_log`],
    ['call the internal role helper', `SELECT public.zc_admin_role_of('${SA}')`],
    ['call the internal audit helper', `SELECT public.zc_audit(NULL, 'fake', NULL, NULL, '{}')`],
    ['call the transfer procedure', `SELECT public.zc_transfer_super_admin('asha@example.test')`],
  ]) {
    const e = await errOf(user(U1, sql));
    check(`Regular user cannot ${label}`, /permission denied/i.test(e ?? ''), e ?? 'no error');
  }
  for (const fn of ['admin_overview()', `admin_list_users()`, `admin_get_user('${U2}')`, `admin_set_account_status('${U2}','suspended','x')`, `admin_list_subscriptions()`, `admin_list_admins()`, `admin_grant_admin('asha@example.test')`, `admin_audit_log()`, `admin_system_info()`, `admin_expire_lapsed_subscriptions()`]) {
    const e = await errOf(user(U1, `SELECT * FROM public.${fn}`));
    check(`Regular user calling ${fn.split('(')[0]} is refused in the database`, /admin_required|super_admin_required/.test(e ?? ''), e ?? 'no error');
  }
  const anonE = await errOf(as('anon', null, `SELECT public.admin_overview()`));
  check('Signed-out (anon) cannot execute admin functions', /permission denied/i.test(anonE ?? ''), anonE ?? '');
  check('RLS is enabled on the new tables', (await q(`SELECT bool_and(relrowsecurity) ok FROM pg_class WHERE relname IN ('app_admins','account_status','admin_audit_log')`))[0].ok === true);

  section('Admin role grant / revoke');
  await user(SA, `SELECT public.admin_grant_admin('staff@client.test')`);
  check('Super Admin grants Admin to an existing account', (await user(AD, `SELECT public.zc_my_admin_role() r`)).rows[0].r === 'admin');
  check('Granting twice is refused', /already_admin/.test(await errOf(user(SA, `SELECT public.admin_grant_admin('staff@client.test')`))));
  check('Granting to an unknown email is refused', /user_not_found/.test(await errOf(user(SA, `SELECT public.admin_grant_admin('ghost@x.test')`))));
  check('An Admin cannot grant roles', /super_admin_required/.test(await errOf(user(AD, `SELECT public.admin_grant_admin('asha@example.test')`))));
  check('An Admin cannot revoke roles (not even the Super Admin)', /super_admin_required/.test(await errOf(user(AD, `SELECT public.admin_revoke_admin('${SA}')`))));
  check('The Super Admin role cannot be revoked through the dashboard', /cannot_change_super_admin/.test(await errOf(user(SA, `SELECT public.admin_revoke_admin('${SA}')`))));
  const svcDel = await errOf(as('service_role', null, `DELETE FROM public.app_admins WHERE user_id = '${SA}'`));
  check('The service role cannot delete/demote the Super Admin row (no write privilege)', /permission denied|super_admin_protected/.test(svcDel ?? ''), svcDel ?? 'no error');
  const ownerDel = await errOf(db.query(`DELETE FROM public.app_admins WHERE user_id = '${SA}'`));
  const ownerUpd = await errOf(db.query(`UPDATE public.app_admins SET role = 'admin' WHERE user_id = '${SA}'`));
  check('Even the database owner cannot delete or demote the Super Admin outside the transfer procedure', /super_admin_protected/.test(ownerDel ?? '') && /super_admin_protected/.test(ownerUpd ?? ''), `${ownerDel} | ${ownerUpd}`);
  const delAuth = await errOf(db.query(`DELETE FROM auth.users WHERE id = '${SA}'`));
  check("Deleting the Super Admin's auth account is blocked until the role is transferred", /super_admin_protected/.test(delAuth ?? ''), delAuth ?? 'no error');
  const second = await errOf(db.query(`INSERT INTO public.app_admins (user_id, role) VALUES ('${U1}', 'super_admin')`));
  check('A second super_admin row is impossible (unique index)', /uq_app_admins_one_super_admin/.test(second ?? ''), second ?? 'no error');

  section('Dashboard data');
  const ov = (await user(AD, `SELECT public.admin_overview() o`)).rows[0].o;
  check('Overview counts come from the database', ov.total_users === 5 && ov.active_users_30d === 3 && ov.active_trials === 1 && ov.active_monthly === 0 && ov.active_yearly === 1 && ov.pending_requests === 1 && ov.expired === 1 && ov.admins === 2,
    JSON.stringify({ ...ov, recent_activity: ov.recent_activity.length }));
  const users = (await user(AD, `SELECT * FROM public.admin_list_users()`)).rows;
  check('User list returns all 5 users with membership status', users.length === 5 && users.find(u => u.user_id === U1)?.membership_plan === 'trial' && users.find(u => u.user_id === U2)?.membership_plan === 'yearly');
  check('Search by email works', (await user(AD, `SELECT * FROM public.admin_list_users('RAVI@')`)).rows.map(r => r.email).join() === 'ravi@example.test');
  check('Search by name works (no wildcard injection)', (await user(AD, `SELECT * FROM public.admin_list_users('asha men')`)).rows.length === 1 && (await user(AD, `SELECT * FROM public.admin_list_users('%')`)).rows.length === 0);
  const cols = Object.keys(users[0]).join(',');
  check('User list exposes no medical or sensitive profile fields', !/medic|allerg|date_of_birth|gender|weight|height|lab|consult/.test(cols), cols);
  const detail = (await user(AD, `SELECT public.admin_get_user('${U2}') d`)).rows[0].d;
  const dj = JSON.stringify(detail);
  check('User detail: account, profile name, membership history — no medical data', detail.full_name === 'Ravi Kumar' && detail.subscriptions.length === 2 && !/SecretMed|SecretAllergen|1985|male/.test(dj), Object.keys(detail).join(','));
  const subs = async f => (await user(AD, `SELECT * FROM public.admin_list_subscriptions($1)`, [f])).rows;
  check('Subscription filters: trial / monthly / yearly / active / pending / expired',
    (await subs('trial')).length === 1 && (await subs('monthly')).length === 2 && (await subs('yearly')).length === 1 &&
    (await subs('active')).length === 2 && (await subs('pending')).length === 1 && (await subs('expired')).length === 1 && (await subs('all')).length === 4);
  check('Payment reference visible for the paid subscription', (await subs('yearly'))[0].provider_reference === 'pay_Y_1');
  check('Invalid filter rejected', /invalid_filter/.test(await errOf(subs('everything'))));
  check('Admins cannot activate paid subscriptions (service role only)', /permission denied/i.test(await errOf(user(SA, `SELECT * FROM public.activate_subscription($1, 'fake_pay', 199)`, [pendM.id])) ?? ''));
  check('…and the pending request stays pending', (await q(`SELECT status FROM public.subscriptions WHERE id=$1`, [pendM.id]))[0].status === 'pending');

  section('Medical record privacy');
  for (const [table, label] of [['medications', 'medications'], ['allergies', 'allergies'], ['profiles', 'profiles']]) {
    const n = (await user(SA, `SELECT count(*)::int n FROM public.${table} WHERE user_id <> '${SA}'`)).rows[0].n;
    check(`Super Admin reading other users' ${label} directly gets 0 rows (user-level RLS unchanged)`, n === 0);
  }
  check('Users still see only their own records', (await user(U1, `SELECT name FROM public.medications`)).rows.map(r => r.name).join() === 'SecretMedA');

  section('Deactivate / reactivate');
  check('Deactivation requires a reason', /reason_required/.test(await errOf(user(AD, `SELECT public.admin_set_account_status('${U1}', 'suspended', '  ')`))));
  await user(AD, `SELECT public.admin_set_account_status('${U1}', 'suspended', 'Requested by account holder')`);
  check('Suspended user: status reported as suspended', (await user(U1, `SELECT public.zc_my_account_status() s`)).rows[0].s === 'suspended');
  check('Suspended user cannot read their own records', (await user(U1, `SELECT count(*)::int n FROM public.medications`)).rows[0].n === 0 && (await user(U1, `SELECT count(*)::int n FROM public.profiles`)).rows[0].n === 0);
  const ins = await errOf(user(U1, `INSERT INTO public.medications (user_id, name, status) VALUES ('${U1}','X','active')`));
  check('Suspended user cannot write records', /row-level security/i.test(ins ?? ''), ins ?? 'no error');
  const sto = await errOf(user(U1, `INSERT INTO storage.objects (bucket_id, name) VALUES ('medical-documents', '${U1}/x.pdf')`));
  check('Suspended user cannot upload to medical-documents storage', /row-level security/i.test(sto ?? ''), sto ?? 'no error');
  check('Suspended user has no membership access', (await user(U1, `SELECT * FROM public.get_my_access()`)).rows[0].has_access === false);
  check('Other users are unaffected', (await user(U2, `SELECT count(*)::int n FROM public.medications`)).rows[0].n === 1);
  check('Filter users by suspended', (await user(AD, `SELECT * FROM public.admin_list_users(NULL, 'suspended')`)).rows.map(r => r.user_id).join() === U1);
  await user(AD, `SELECT public.admin_set_account_status('${U1}', 'active')`);
  check('Reactivated user sees their records again', (await user(U1, `SELECT count(*)::int n FROM public.medications`)).rows[0].n === 1);
  check('An admin cannot change their own status', /cannot_change_own_status/.test(await errOf(user(AD, `SELECT public.admin_set_account_status('${AD}', 'suspended', 'x')`))));
  check('Nobody can deactivate the Super Admin', /cannot_change_super_admin/.test(await errOf(user(AD, `SELECT public.admin_set_account_status('${SA}', 'suspended', 'x')`))));
  await user(SA, `SELECT public.admin_set_account_status('${AD}', 'suspended', 'Left the company')`);
  check('A suspended Admin loses admin access immediately', (await user(AD, `SELECT public.zc_my_admin_role() r`)).rows[0].r === null && /admin_required/.test(await errOf(user(AD, `SELECT public.admin_overview()`))));
  await user(SA, `SELECT public.admin_set_account_status('${AD}', 'active')`);

  section('Membership rules still intact');
  check('Trial still once per account', /trial_already_used/.test(await errOf(user(U1, `SELECT * FROM public.start_free_trial()`))));
  check('Browser still cannot write subscriptions', /permission denied/i.test(await errOf(user(U2, `INSERT INTO public.subscriptions (user_id, plan, status, amount, period_end) VALUES ('${U2}','yearly','active',1,now()+interval '1 year')`)) ?? ''));

  section('System');
  const sys = (await user(AD, `SELECT public.admin_system_info() s`)).rows[0].s;
  check('System info shows the plan catalogue from the database', JSON.stringify(sys.plans.map(p => [p.plan, Number(p.amount)])) === JSON.stringify([['trial', 0], ['monthly', 199], ['yearly', 1299]]) && sys.lapsed_not_marked === 1);
  check('Only the Super Admin can run housekeeping', /super_admin_required/.test(await errOf(user(AD, `SELECT public.admin_expire_lapsed_subscriptions()`))));
  check('Super Admin housekeeping marks the lapsed row expired', (await user(SA, `SELECT public.admin_expire_lapsed_subscriptions() n`)).rows[0].n === 1);

  section('Audit log');
  const log = (await user(SA, `SELECT * FROM public.admin_audit_log(100)`)).rows;
  const actions = log.map(l => l.action);
  for (const a of ['role.super_admin_bootstrapped', 'role.granted', 'user.viewed', 'user.deactivated', 'user.reactivated', 'system.expire_lapsed'])
    check(`Audit log records ${a}`, actions.includes(a));
  const deact = log.find(l => l.action === 'user.deactivated' && l.target_id === U1);
  check('Audit entry has admin, target, time and the reason (no sensitive data)', deact?.actor_email === 'staff@client.test' && deact?.target_email === 'asha@example.test' && deact?.metadata?.reason === 'Requested by account holder' && !!deact?.created_at);
  check('No audit entry contains medical data', !/SecretMed|SecretAllergen|password|token/i.test(JSON.stringify(log)));
  const upd = await errOf(as('service_role', null, `UPDATE public.admin_audit_log SET action = 'x'`));
  const del = await errOf(as('service_role', null, `DELETE FROM public.admin_audit_log`));
  check('Audit log is append-only (even for the service role)', /append-only|permission denied/.test(upd ?? '') && /append-only|permission denied/.test(del ?? ''), `${upd} | ${del}`);

  section('Changing the Super Admin later');
  await db.query(`SELECT public.zc_transfer_super_admin('staff@client.test', true)`);
  check('Transfer: new account is Super Admin, previous one kept as Admin',
    (await user(AD, `SELECT public.zc_my_admin_role() r`)).rows[0].r === 'super_admin' && (await user(SA, `SELECT public.zc_my_admin_role() r`)).rows[0].r === 'admin');
  check('The previous Super Admin can no longer grant roles', /super_admin_required/.test(await errOf(user(SA, `SELECT public.admin_grant_admin('asha@example.test')`))));
  check('Transfer is audited', (await q(`SELECT count(*)::int n FROM public.admin_audit_log WHERE action = 'role.super_admin_transferred'`))[0].n === 1);
  await db.query(`SELECT public.zc_transfer_super_admin('owner@client.test', false)`);
  check('Transfer back without keeping the old one: exactly one admin row is super_admin, old one removed',
    (await q(`SELECT string_agg(role, ',' ORDER BY role) r FROM public.app_admins`))[0].r === 'super_admin');

  section('Rollback');
  await db.query(readFileSync(ROLLBACK, 'utf8'));
  const leftovers = (await q(`SELECT count(*)::int n FROM pg_proc WHERE proname LIKE 'admin\\_%' OR proname IN ('zc_my_admin_role','zc_is_active_user','zc_bootstrap_super_admin')`))[0].n
    + (await q(`SELECT count(*)::int n FROM pg_tables WHERE tablename IN ('app_admins','account_status','admin_audit_log')`))[0].n
    + (await q(`SELECT count(*)::int n FROM pg_policies WHERE policyname LIKE 'zc_account_active%'`))[0].n;
  check('Rollback removes every admin object', leftovers === 0, `${leftovers} left`);
  check('Rollback keeps user data and membership functions', (await q(`SELECT count(*)::int n FROM public.medications`))[0].n === 2 && (await q(`SELECT count(*)::int n FROM pg_proc WHERE proname='start_free_trial'`))[0].n === 1);
  await db.query(sqlOf(ADMIN));
  check('Migration re-applies cleanly after rollback', true);
} catch (e) {
  check('TEST ERROR', false, e.stack?.split('\n').slice(0, 3).join(' | '));
} finally {
  await pool.end().catch(() => {});
  await db.end().catch(() => {});
  await server.stop();
  rmSync(DIR, { recursive: true, force: true });
}
console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
