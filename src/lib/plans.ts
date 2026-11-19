// ============================================================
// ZCare membership plans
// ============================================================
// Display copy of the plan catalogue. The AUTHORITATIVE prices and durations
// are in the database (public.zc_plan_terms, migration 20261119000000): the
// browser never sends a price, a duration or a status to the server.

import type { PlanDefinition, PlanId, Subscription } from '../types/index.ts';

export const PLAN_PRICES: Record<PlanId, number> = { trial: 0, monthly: 199, yearly: 1299 };

/** What 12 monthly payments would cost compared with one yearly payment. */
export const YEARLY_SAVINGS = PLAN_PRICES.monthly * 12 - PLAN_PRICES.yearly; // ₹1,089

export const PLANS: PlanDefinition[] = [
  {
    id: 'trial',
    name: 'Free Trial',
    period: 'trial',
    price: PLAN_PRICES.trial,
    currency: 'INR',
    priceLabel: 'Free',
    durationLabel: '1 day',
    billingLabel: 'No payment needed · ends automatically after 24 hours · one trial per account',
    features: [
      'Full access for 24 hours',
      'Store your health records',
      'Track medications & allergies',
      'Health reminders',
    ],
  },
  {
    id: 'monthly',
    name: 'Monthly',
    period: 'monthly',
    price: PLAN_PRICES.monthly,
    currency: 'INR',
    priceLabel: '₹199',
    durationLabel: '/month',
    billingLabel: 'Billed monthly · ₹199 for 1 calendar month',
    features: [
      'Store your health records',
      'Track medications & allergies',
      'Doctor consultation history',
      'Health reminders',
      'Insurance management',
      'Download health summaries',
    ],
  },
  {
    id: 'yearly',
    name: 'Yearly',
    period: 'yearly',
    price: PLAN_PRICES.yearly,
    currency: 'INR',
    priceLabel: '₹1,299',
    durationLabel: '/year',
    billingLabel: `Billed annually · ₹1,299 for 1 year · save ₹${YEARLY_SAVINGS.toLocaleString('en-IN')} vs 12 monthly payments`,
    features: [
      'Everything in Monthly',
      'Priority support',
      'Advanced health reports',
      'Unlimited document storage',
      'Family member management',
    ],
    recommended: true,
    savings: `Save ₹${YEARLY_SAVINGS.toLocaleString('en-IN')}`,
  },
];

export const planById = (id: string) => PLANS.find(p => p.id === id) ?? null;

export const formatCurrency = (amount: number, currency = 'INR'): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

/**
 * End of a plan period, matching PostgreSQL interval arithmetic in UTC:
 * trial +24 h; monthly/yearly add calendar months/years and clamp to the last
 * day of a shorter month (31 Jan + 1 month = 28/29 Feb; 29 Feb 2028 + 1 year = 28 Feb 2029).
 */
export function planPeriodEnd(start: Date, plan: PlanId): Date {
  if (plan === 'trial') return new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const months = plan === 'monthly' ? 1 : 12;
  const y = start.getUTCFullYear();
  const m = start.getUTCMonth() + months;
  const targetYear = y + Math.floor(m / 12);
  const targetMonth = m % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(
    targetYear,
    targetMonth,
    Math.min(start.getUTCDate(), lastDay),
    start.getUTCHours(),
    start.getUTCMinutes(),
    start.getUTCSeconds(),
    start.getUTCMilliseconds(),
  ));
}

export interface MembershipState {
  /** True only for an unexpired paid ('active') or 'trial' subscription. */
  hasAccess: boolean;
  current: Subscription | null;
  trialUsed: boolean;
  pending: Subscription | null;
  /** Most recent subscription that has ended (for "expired" messaging). */
  lapsed: Subscription | null;
}

/** Works out access from a user's subscription rows. Pending/cancelled/expired never grant access. */
export function membershipState(rows: Subscription[], now: Date = new Date()): MembershipState {
  const t = now.getTime();
  const live = rows
    .filter(r => (r.status === 'active' || r.status === 'trial') && new Date(r.period_end).getTime() > t)
    .sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active') || b.period_end.localeCompare(a.period_end));
  const ended = rows
    .filter(r => r.status === 'expired' || r.status === 'cancelled' || ((r.status === 'active' || r.status === 'trial') && new Date(r.period_end).getTime() <= t))
    .sort((a, b) => b.period_end.localeCompare(a.period_end));
  const pending = rows.filter(r => r.status === 'pending').sort((a, b) => b.created_at.localeCompare(a.created_at));
  return {
    hasAccess: live.length > 0,
    current: live[0] ?? null,
    trialUsed: rows.some(r => r.plan === 'trial'),
    pending: pending[0] ?? null,
    lapsed: ended[0] ?? null,
  };
}
