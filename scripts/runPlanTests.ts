// ============================================================
// ZCare membership plan tests (pricing, calendar periods, access rules)
// Run: node --experimental-strip-types scripts/runPlanTests.ts
// Database-side enforcement (trial once, no self-activation, RLS) lives in
// migration 20261119000000_membership_plans.sql.
// ============================================================
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PLANS, PLAN_PRICES, YEARLY_SAVINGS, membershipState, planPeriodEnd } from '../src/lib/plans.ts';
import type { Subscription } from '../src/types/index.ts';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}\n      ${(err as Error).message.split('\n').join('\n      ')}`);
  }
}
const iso = (d: Date) => d.toISOString();

console.log('\n========================================================');
console.log(' ZCARE MEMBERSHIP PLANS — TEST SUITE');
console.log('========================================================');

test('three plans in order: Free Trial, Monthly, Yearly', () => {
  assert.deepEqual(PLANS.map(p => p.id), ['trial', 'monthly', 'yearly']);
  assert.deepEqual(PLANS.map(p => p.name), ['Free Trial', 'Monthly', 'Yearly']);
});
test('prices: Free / ₹199 per month / ₹1,299 per year (INR)', () => {
  assert.deepEqual(PLAN_PRICES, { trial: 0, monthly: 199, yearly: 1299 });
  assert.deepEqual(PLANS.map(p => `${p.priceLabel}${p.durationLabel === '1 day' ? ' ' : ''}${p.durationLabel}`), ['Free 1 day', '₹199/month', '₹1,299/year']);
  assert.ok(PLANS.every(p => p.currency === 'INR'));
});
test('yearly saving is ₹1,089 versus 12 monthly payments', () => {
  assert.equal(YEARLY_SAVINGS, 1089);
  assert.match(PLANS[2].billingLabel, /₹1,089/);
  assert.equal(PLANS[2].savings, 'Save ₹1,089');
});
test('billing period and total are shown for every plan', () => {
  assert.match(PLANS[0].billingLabel, /24 hours/);
  assert.match(PLANS[1].billingLabel, /Billed monthly.*₹199/);
  assert.match(PLANS[2].billingLabel, /Billed annually.*₹1,299/);
});
test('app prices match the database (migration zc_plan_terms)', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261119000000_membership_plans.sql', import.meta.url), 'utf8');
  const row = (plan: string) => sql.match(new RegExp(`\\('${plan}',\\s*(\\d+)::NUMERIC,\\s*INTERVAL '([^']+)'\\)`));
  assert.equal(Number(row('trial')?.[1]), PLAN_PRICES.trial);
  assert.equal(Number(row('monthly')?.[1]), PLAN_PRICES.monthly);
  assert.equal(Number(row('yearly')?.[1]), PLAN_PRICES.yearly);
  assert.deepEqual([row('trial')?.[2], row('monthly')?.[2], row('yearly')?.[2]], ['24 hours', '1 month', '1 year']);
});

test('trial lasts exactly 24 hours', () => {
  const s = new Date('2026-11-19T10:15:30.000Z');
  assert.equal(planPeriodEnd(s, 'trial').getTime() - s.getTime(), 24 * 3600 * 1000);
});
test('monthly = 1 calendar month (not 30 days), clamped to month end', () => {
  assert.equal(iso(planPeriodEnd(new Date('2026-11-19T10:00:00Z'), 'monthly')), '2026-12-19T10:00:00.000Z');
  assert.equal(iso(planPeriodEnd(new Date('2027-01-31T10:00:00Z'), 'monthly')), '2027-02-28T10:00:00.000Z');
  assert.equal(iso(planPeriodEnd(new Date('2028-01-31T10:00:00Z'), 'monthly')), '2028-02-29T10:00:00.000Z');
  assert.equal(iso(planPeriodEnd(new Date('2026-12-15T10:00:00Z'), 'monthly')), '2027-01-15T10:00:00.000Z');
  assert.equal(iso(planPeriodEnd(new Date('2027-02-01T00:00:00Z'), 'monthly')), '2027-03-01T00:00:00.000Z'); // 28 days, not 30
});
test('yearly = 1 calendar year, including leap days', () => {
  assert.equal(iso(planPeriodEnd(new Date('2026-11-19T10:00:00Z'), 'yearly')), '2027-11-19T10:00:00.000Z');
  assert.equal(iso(planPeriodEnd(new Date('2028-02-29T10:00:00Z'), 'yearly')), '2029-02-28T10:00:00.000Z');
  assert.equal(iso(planPeriodEnd(new Date('2027-03-01T00:00:00Z'), 'yearly')), '2028-03-01T00:00:00.000Z'); // spans 29 Feb 2028 (366 days)
});

const NOW = new Date('2026-11-19T12:00:00Z');
const sub = (over: Partial<Subscription>): Subscription => ({
  id: Math.random().toString(36).slice(2), user_id: 'u1', plan: 'monthly', status: 'active', amount: 199, currency: 'INR',
  provider_reference: null, period_start: '2026-11-01T00:00:00Z', period_end: '2026-12-01T00:00:00Z',
  created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', ...over,
});
test('active, unexpired paid plan grants access', () => {
  assert.equal(membershipState([sub({})], NOW).hasAccess, true);
});
test('trial grants access only for its 24 hours', () => {
  const t = sub({ plan: 'trial', status: 'trial', amount: 0, period_start: '2026-11-19T00:00:00Z', period_end: '2026-11-20T00:00:00Z' });
  assert.equal(membershipState([t], NOW).hasAccess, true);
  assert.equal(membershipState([t], new Date('2026-11-20T00:00:01Z')).hasAccess, false);
  assert.equal(membershipState([t], new Date('2026-11-20T00:00:01Z')).trialUsed, true);
});
test('expired subscription loses access (even if still marked active)', () => {
  const s = membershipState([sub({ period_end: '2026-11-19T11:59:59Z' })], NOW);
  assert.equal(s.hasAccess, false);
  assert.ok(s.lapsed);
});
test('pending, cancelled and expired statuses never grant access', () => {
  for (const status of ['pending', 'cancelled', 'expired'] as const) {
    assert.equal(membershipState([sub({ status, period_end: '2027-12-01T00:00:00Z' })], NOW).hasAccess, false, status);
  }
  assert.equal(membershipState([sub({ status: 'pending' })], NOW).pending?.status, 'pending');
});
test('paid plan is preferred over a trial when both are live', () => {
  const s = membershipState([
    sub({ plan: 'trial', status: 'trial', period_end: '2026-11-20T00:00:00Z' }),
    sub({ plan: 'yearly', status: 'active', period_end: '2027-11-19T00:00:00Z' }),
  ], NOW);
  assert.equal(s.current?.plan, 'yearly');
});
test('no rows: no access, trial still available', () => {
  const s = membershipState([], NOW);
  assert.equal(s.hasAccess, false);
  assert.equal(s.trialUsed, false);
});

console.log('\n========================================================');
console.log(` PLAN RESULTS: ${passed} passed, ${failed} failed`);
console.log('========================================================');
if (failed) process.exit(1);
