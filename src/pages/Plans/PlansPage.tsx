import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, ArrowRight, Star, Info, Clock, ShieldCheck } from 'lucide-react';
import Logo from '@/components/ui/Logo';
import { PLANS, membershipState, planById, type MembershipState } from '@/lib/plans';
import { useAuth } from '@/contexts/AuthContext';
import { getMembership, startFreeTrial } from '@/services/api';
import { startRazorpayCheckout } from '@/services/razorpay';
import { useToast } from '@/components/ui/Toast';
import type { PlanId } from '@/types';

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function PlansPage() {
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('yearly');
  const [loading, setLoading] = useState(false);
  const [membership, setMembership] = useState<MembershipState | null>(null);
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getMembership(user.id)
      .then(m => {
        if (!cancelled) setMembership(m);
      })
      .catch(() => {
        // The server still enforces trial eligibility; let the user try.
        if (!cancelled) setMembership(membershipState([]));
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const selected = planById(selectedPlan)!;
  const trialUnavailable = !!membership && (membership.trialUsed || membership.current?.status === 'active');

  const handleContinue = async () => {
    if (!user) return;
    setLoading(true);
    try {
      if (selected.id === 'trial') {
        const sub = await startFreeTrial(user.id);
        showToast('success', `Your free trial is active until ${fmtDateTime(sub.period_end)}.`);
        navigate('/dashboard');
      } else {
        const result = await startRazorpayCheckout(selected.id, user, profile);
        if (result.success) {
          showToast('success', `Payment successful! Your ${selected.name} membership is now active.`);
          const updated = await getMembership(user.id);
          setMembership(updated);
          navigate('/dashboard');
        }
      }
    } catch (err: any) {
      if (err?.message?.includes('cancelled')) {
        showToast('info', 'Payment was cancelled.');
      } else {
        showToast('error', err instanceof Error ? err.message : 'Payment failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const current = membership?.current ?? null;

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--color-bg-page)' }}>
      <div className="card p-6 sm:p-8 max-w-xl w-full">
        <div className="flex justify-center mb-6">
          <Logo size="md" />
        </div>

        <h1 className="text-xl font-bold text-center mb-1">Choose your plan</h1>
        <p className="text-sm text-center mb-6" style={{ color: 'var(--color-text-muted)' }}>
          Try ZCare free for a day, then choose monthly or yearly. Prices in Indian Rupees.
        </p>

        {current && (
          <div className="flex items-start gap-2 p-3 rounded-lg mb-5 text-xs" style={{ backgroundColor: 'var(--color-mint-lighter)', color: 'var(--color-teal-deep)' }}>
            <Clock size={14} className="shrink-0 mt-0.5" />
            <span>
              {current.status === 'trial' ? 'Your free trial' : `Your ${planById(current.plan)?.name ?? current.plan} plan`} is active until{' '}
              <strong>{fmtDateTime(current.period_end)}</strong>.
            </span>
          </div>
        )}

        <div className="flex flex-col gap-4 mb-6" role="radiogroup" aria-label="Membership plans">
          {PLANS.map(plan => {
            const isSelected = selectedPlan === plan.id;
            const disabled = plan.id === 'trial' && trialUnavailable;
            return (
              <button
                key={plan.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setSelectedPlan(plan.id)}
                className="card card-hover text-left p-4 relative"
                style={{
                  borderColor: isSelected ? 'var(--color-emerald-primary)' : 'var(--color-border-light)',
                  borderWidth: isSelected ? 2 : 1,
                  cursor: 'pointer',
                  background: isSelected ? 'var(--color-mint-lighter)' : 'var(--color-white)',
                  opacity: disabled ? 0.7 : 1,
                }}
              >
                {plan.recommended && (
                  <span className="badge absolute -top-2.5 right-4" style={{ backgroundColor: 'var(--color-emerald-primary)', color: 'white', fontSize: 11 }}>
                    <Star size={10} />
                    Best value
                  </span>
                )}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className="flex items-center justify-center rounded-full shrink-0 mt-0.5"
                      style={{ width: 20, height: 20, border: `2px solid ${isSelected ? 'var(--color-emerald-primary)' : 'var(--color-border)'}` }}
                    >
                      {isSelected && <div className="rounded-full" style={{ width: 10, height: 10, backgroundColor: 'var(--color-emerald-primary)' }} />}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-base flex items-center gap-2 flex-wrap">
                        {plan.name}
                        {plan.savings && <span className="badge badge-success text-xs">{plan.savings}</span>}
                        {disabled && <span className="badge text-xs" style={{ backgroundColor: 'var(--color-border-light)', color: 'var(--color-text-muted)' }}>Already used</span>}
                      </div>
                      <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{plan.billingLabel}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xl font-bold" style={{ color: 'var(--color-emerald-primary)' }}>{plan.priceLabel}</span>
                    <span className="text-xs ml-1" style={{ color: 'var(--color-text-muted)' }}>{plan.durationLabel}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Features */}
        <div className="mb-6">
          <p className="text-sm font-medium mb-3">{selected.name} includes:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {selected.features.map(feature => (
              <div key={feature} className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                <Check size={14} style={{ color: 'var(--color-emerald-primary)' }} className="shrink-0" />
                {feature}
              </div>
            ))}
          </div>
        </div>

        {selected.id !== 'trial' && (
          <div className="flex items-center gap-2 p-3 rounded-lg mb-6 text-xs bg-[var(--color-mint-lighter)] text-[var(--color-teal-deep)] border border-[var(--color-border-light)]">
            <ShieldCheck size={16} className="shrink-0 text-[var(--color-emerald-primary)]" />
            <span>
              Secure online payment powered by <strong>Razorpay</strong>. Supports UPI (Google Pay, PhonePe, Paytm, BHIM), Cards & Net Banking.
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={handleContinue}
          className="btn btn-primary btn-lg w-full font-medium shadow-sm"
          disabled={loading || (selected.id === 'trial' && (trialUnavailable || !membership))}
        >
          {loading ? (
            <span className="spinner" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
          ) : selected.id === 'trial' ? (
            trialUnavailable ? 'Free trial already used' : 'Start 1-day free trial'
          ) : (
            <>
              Pay with Razorpay · {selected.priceLabel}
              <ArrowRight size={18} />
            </>
          )}
        </button>

        <p className="text-xs text-center mt-4 text-[var(--color-text-light)]">
          <Link to="/dashboard" className="font-medium hover:underline text-[var(--color-emerald-primary)]">
            Skip for now
          </Link>
          <br />
          By continuing, you agree to ZCare&apos;s{' '}
          <Link to="/terms" className="underline hover:text-[var(--color-teal-deep)]">Terms</Link> and{' '}
          <Link to="/refund-policy" className="underline hover:text-[var(--color-teal-deep)]">Refund Policy</Link>. Prices in INR (₹).
        </p>
      </div>
    </div>
  );
}
