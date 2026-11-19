import type { AssistantStage } from '@/types/ai.types';

const LABELS: Record<AssistantStage, string> = {
  understanding: 'Understanding your question…',
  retrieving: 'Checking your records…',
  indexing: 'Searching your scanned reports…',
  generating: 'Writing an explanation on your device…',
};

export default function TypingIndicator({ stage }: { stage: AssistantStage }) {
  return (
    <div className="flex items-center gap-2.5" role="status" aria-live="polite">
      <span className="flex items-center gap-1" aria-hidden>
        <span className="ai-typing-dot" />
        <span className="ai-typing-dot" />
        <span className="ai-typing-dot" />
      </span>
      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {LABELS[stage]}
      </span>
    </div>
  );
}
