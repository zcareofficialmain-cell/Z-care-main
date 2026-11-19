import { ShieldCheck } from 'lucide-react';

/** Persistent medical-safety notice shown above the conversation. */
export default function AIHealthDisclaimer() {
  return (
    <div
      role="note"
      className="flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-xs leading-relaxed"
      style={{
        backgroundColor: 'var(--color-mint-lighter)',
        border: '1px solid var(--color-border-light)',
        color: 'var(--color-text-muted)',
      }}
    >
      <ShieldCheck size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--color-emerald-primary)' }} aria-hidden />
      <p className="m-0">
        <strong style={{ color: 'var(--color-teal-deep)' }}>For information only — not a diagnosis or medical advice.</strong>{' '}
        Check with your doctor before acting on anything here. In an emergency, call <strong>112</strong>.
        <span className="hidden sm:inline"> The AI runs privately on this device; your records are not sent to any AI service.</span>
      </p>
    </div>
  );
}
