import { useEffect, useRef } from 'react';
import { ListChecks, MessageCircleQuestion, Sparkles } from 'lucide-react';
import type { HealthAssistant } from '@/hooks/useHealthAssistant';
import ChatInput from './ChatInput';
import ChatMessage from './ChatMessage';
import ModelLoading from './ModelLoading';

export const SUGGESTED_QUESTIONS = [
  'What does my recent blood test indicate?',
  'Summarize my relevant medical history.',
  'What medications am I currently taking?',
  'Are there any changes in my recent lab results?',
  'What should I discuss with my doctor during my next appointment?',
];

export default function ChatWindow({ assistant }: { assistant: HealthAssistant }) {
  const { messages, phase, canSend, busy, actions } = assistant;
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // Follow new content unless the user has scrolled up to read.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, phase]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const ask = (q: string) => {
    stickToBottom.current = true;
    void actions.send(q);
  };

  const showSetup = phase !== 'ready' && phase !== 'records-only';
  const placeholder =
    phase === 'ready' || phase === 'records-only'
      ? 'Ask about your health records…'
      : 'The assistant will be available once it is set up…';

  return (
    <section className="card flex flex-col flex-1 min-h-0 overflow-hidden" aria-label="Health Assistant conversation">
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-5 py-4 space-y-4" aria-live="polite">
        {/* Welcome */}
        <div className="flex items-start gap-2.5">
          <div className="flex items-center justify-center rounded-full shrink-0" style={{ width: 30, height: 30, backgroundColor: 'var(--color-mint-soft)' }} aria-hidden>
            <Sparkles size={15} style={{ color: 'var(--color-emerald-primary)' }} />
          </div>
          <div className="ai-bubble-assistant px-4 py-3 text-sm leading-relaxed" style={{ maxWidth: 'min(100%, 620px)' }}>
            <p className="m-0">
              Hello! I&apos;m your <strong>ZCare Health Assistant</strong>. I can help you understand your health information using your medical history
              and records — your medicines, allergies, lab results, doctor visits and scanned reports.
            </p>
            <p className="m-0 mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              I can&apos;t diagnose or prescribe, and I may make mistakes. Please confirm anything important with your doctor.
            </p>
          </div>
        </div>

        {showSetup && <ModelLoading assistant={assistant} />}

        {messages.length === 0 && !showSetup && (
          <div>
            <p className="m-0 mb-2 text-xs font-semibold flex items-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
              <MessageCircleQuestion size={14} aria-hidden /> Try asking
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_QUESTIONS.map(q => (
                <button key={q} type="button" className="ai-chip" onClick={() => ask(q)} disabled={!canSend}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(m => (
          <ChatMessage key={m.id} message={m} />
        ))}
      </div>

      {phase === 'records-only' && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-5 py-2 text-xs" style={{ borderTop: '1px solid var(--color-border-light)', backgroundColor: 'var(--color-mint-lighter)', color: 'var(--color-text-muted)' }}>
          <span className="flex items-center gap-1.5">
            <ListChecks size={14} aria-hidden /> Records-only mode: answers list your records without AI explanations.
          </span>
          <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '4px 10px' }} onClick={actions.enableAi}>
            Turn on AI explanations
          </button>
        </div>
      )}

      <div className="px-3 sm:px-4 py-3" style={{ borderTop: '1px solid var(--color-border-light)' }}>
        <ChatInput disabled={!canSend} busy={busy} placeholder={placeholder} onSend={ask} onStop={actions.stop} />
      </div>
    </section>
  );
}
