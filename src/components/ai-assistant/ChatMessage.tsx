import { Fragment, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ChevronRight,
  ClipboardList,
  Cpu,
  FileText,
  Info,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { ChatMessageView, FactItem, FactTone, SourceRef } from '@/types/ai.types';
import TypingIndicator from './TypingIndicator';

// ------------------------------------------------------------
// Safe text formatting (model output is untrusted: React text only, no HTML)
// ------------------------------------------------------------
const SECTION_LABEL = /^(Answer|What your records show|What this means|Possible factors|Next steps)\s*:\s*/i;

function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|_\([^)]+\)_)/g);
  return parts.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (/^_\([^)]+\)_$/.test(part)) return <em key={i} style={{ color: 'var(--color-text-muted)' }}>{part.slice(1, -1)}</em>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

function FormattedText({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flushList = () => {
    if (list.length) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="m-0 pl-5 space-y-1 list-disc">
          {list.map((item, i) => (
            <li key={i}>{inline(item)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  lines.forEach((raw, i) => {
    const line = raw.trim();
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      list.push(bullet[1]);
      return;
    }
    flushList();
    if (!line) return;
    const label = line.match(SECTION_LABEL);
    blocks.push(
      <p key={`p-${i}`} className="m-0">
        {label ? (
          <>
            <strong style={{ color: 'var(--color-teal-deep)' }}>{label[1]}:</strong> {inline(line.slice(label[0].length))}
          </>
        ) : (
          inline(line)
        )}
      </p>,
    );
  });
  flushList();
  return <div className="space-y-2">{blocks}</div>;
}

// ------------------------------------------------------------
// Facts, notes and sources
// ------------------------------------------------------------
const TONE_COLOR: Record<FactTone, string> = {
  normal: 'var(--color-text-primary)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
  muted: 'var(--color-text-muted)',
};

function FactLine({ item, large = false }: { item: FactItem; large?: boolean }) {
  return (
    <li className={`flex items-start gap-1.5 leading-relaxed ${large ? 'text-[13px]' : 'text-xs'}`} style={{ color: TONE_COLOR[item.tone] }}>
      {item.tone === 'danger' || item.tone === 'warning' ? (
        <AlertTriangle size={12} className="shrink-0 mt-[3px]" aria-hidden />
      ) : (
        <span className="shrink-0 mt-[7px] rounded-full" style={{ width: 4, height: 4, backgroundColor: 'currentColor', opacity: 0.6 }} aria-hidden />
      )}
      <span>
        {item.tone === 'danger' && <span className="sr-only">Alert: </span>}
        {item.tone === 'warning' && <span className="sr-only">Attention: </span>}
        {item.text}
      </span>
    </li>
  );
}

function SourceChips({ sources }: { sources: SourceRef[] }) {
  const [showAll, setShowAll] = useState(false);
  if (sources.length === 0) return null;
  const visible = showAll ? sources : sources.slice(0, 6);
  return (
    <div className="mt-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide m-0 mb-1.5" style={{ color: 'var(--color-text-light)' }}>
        Records considered
      </p>
      <div className="flex flex-wrap gap-1.5">
        {visible.map(s => (
          <Link key={`${s.kind}:${s.id}`} to={s.href} className="ai-source-chip" title={s.label}>
            <FileText size={11} aria-hidden />
            <span className="truncate">{s.label}</span>
          </Link>
        ))}
        {sources.length > 6 && (
          <button type="button" className="ai-source-chip" style={{ border: 'none', cursor: 'pointer' }} onClick={() => setShowAll(v => !v)}>
            {showAll ? 'Show fewer' : `+${sources.length - 6} more`}
          </button>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Message
// ------------------------------------------------------------
export default function ChatMessage({ message }: { message: ChatMessageView }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="ai-bubble-user px-4 py-2.5 text-sm whitespace-pre-wrap break-words" style={{ maxWidth: 'min(85%, 560px)' }}>
          {message.text}
        </div>
      </div>
    );
  }

  const answer = message.answer;
  const info = answer ?? message.preview;
  const mode = answer?.mode;
  const emergency = mode === 'emergency';
  const facts = info?.facts ?? [];
  const alerts = facts.flatMap(f => (f.title === 'Medicine check' ? f.items.filter(i => i.tone === 'danger') : []));
  const factCount = facts.reduce((n, f) => n + f.items.length, 0);
  const safetyNotes = answer?.safetyNotes ?? [];
  const urgent = info?.safetyLevel === 'urgent';
  const otherNotes = urgent ? safetyNotes.slice(1) : safetyNotes;
  const alertTexts = new Set(alerts.map(a => a.text));
  const keyPoints = (info?.keyPoints ?? []).filter(p => !alertTexts.has(p.text));
  const aiWritten = mode === 'ai' || (!mode && message.stage === 'generating');

  return (
    <div className="flex justify-start">
      <div
        className={`${emergency ? 'ai-bubble-emergency' : 'ai-bubble-assistant'} px-4 py-3 text-sm leading-relaxed break-words`}
        style={{ maxWidth: 'min(100%, 680px)', width: info || message.text ? '100%' : undefined, color: 'var(--color-text-primary)' }}
      >
        {emergency && (
          <div className="flex items-center gap-2 mb-2 font-semibold" style={{ color: 'var(--color-danger)' }}>
            <ShieldAlert size={18} aria-hidden /> Urgent safety information
          </div>
        )}

        {urgent && (
          <div className="flex items-start gap-2 mb-3 rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: 'var(--color-warning-light)', color: '#92400E', border: '1px solid #FDE68A' }} role="alert">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" aria-hidden />
            <span>{safetyNotes[0] ?? 'What you describe may need prompt medical attention. Please contact your doctor today, or call 112 if it gets worse.'}</span>
          </div>
        )}

        {alerts.length > 0 && (
          <div className="mb-3 rounded-lg px-3 py-2 space-y-1" style={{ backgroundColor: 'var(--color-danger-light)', border: '1px solid #FECACA' }} role="alert">
            {alerts.map((a, i) => (
              <p key={i} className="m-0 flex items-start gap-2 text-xs font-medium" style={{ color: 'var(--color-danger)' }}>
                <AlertTriangle size={14} className="shrink-0 mt-0.5" aria-hidden /> {a.text}
              </p>
            ))}
          </div>
        )}

        {keyPoints.length > 0 && (
          <div className="mb-3">
            <p className="m-0 mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-light)' }}>
              <ClipboardList size={12} aria-hidden /> From your records
            </p>
            <ul className="m-0 p-0 list-none space-y-1">
              {keyPoints.map((p, i) => (
                <FactLine key={i} item={p} large />
              ))}
            </ul>
          </div>
        )}

        {aiWritten && keyPoints.length > 0 && (message.text || message.pending) && (
          <p className="m-0 mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-light)' }}>
            <Sparkles size={12} aria-hidden /> Explanation
          </p>
        )}
        {message.text ? <FormattedText text={message.text} /> : message.pending && message.stage ? <TypingIndicator stage={message.stage} /> : null}
        {message.pending && message.text && message.stage === 'generating' && (
          <span className="inline-block mt-1 align-middle" aria-hidden>
            <span className="ai-typing-dot inline-block" />
          </span>
        )}

        {message.error && (
          <p className="m-0 mt-2 text-sm flex items-start gap-2" style={{ color: 'var(--color-danger)' }} role="alert">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" aria-hidden /> {message.error}
          </p>
        )}

        {factCount > 0 && (
          <details className="ai-facts mt-3 rounded-lg" open={mode === 'records-only'} style={{ border: '1px solid var(--color-border-light)', backgroundColor: 'var(--color-mint-lighter)' }}>
            <summary className="flex items-center gap-2 px-3 py-2 text-xs font-semibold" style={{ color: 'var(--color-teal-deep)' }}>
              <ChevronRight size={14} className="ai-facts-chevron transition-transform" aria-hidden />
              <ClipboardList size={14} aria-hidden />
              What your records show
              <span className="badge badge-neutral" style={{ padding: '1px 8px', fontSize: 11 }}>{factCount}</span>
            </summary>
            <div className="px-3 pb-3 space-y-3">
              {facts.map(section => (
                <div key={section.title}>
                  <p className="m-0 mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-light)' }}>{section.title}</p>
                  <ul className="m-0 p-0 list-none space-y-1">
                    {section.items.map((item, i) => (
                      <FactLine key={i} item={item} />
                    ))}
                  </ul>
                </div>
              ))}
              {info && info.caveats.length > 0 && (
                <div>
                  <p className="m-0 mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-light)' }}>Data notes</p>
                  <ul className="m-0 p-0 list-none space-y-1">
                    {info.caveats.map((c, i) => (
                      <FactLine key={i} item={{ text: c, tone: 'warning' }} />
                    ))}
                  </ul>
                </div>
              )}
              {info && info.omitted.length > 0 && (
                <ul className="m-0 p-0 list-none space-y-1">
                  {info.omitted.map((c, i) => (
                    <FactLine key={i} item={{ text: c, tone: 'muted' }} />
                  ))}
                </ul>
              )}
            </div>
          </details>
        )}

        {info && info.missing.length > 0 && mode !== 'records-only' && (
          <div className="mt-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            <p className="m-0 mb-1 font-semibold flex items-center gap-1.5">
              <Info size={12} aria-hidden /> Not in your records
            </p>
            <ul className="m-0 pl-5 space-y-0.5 list-disc">
              {info.missing.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </div>
        )}

        {otherNotes.length > 0 && (
          <ul className="m-0 mt-3 p-0 list-none space-y-1">
            {otherNotes.map((n, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px]" style={{ color: 'var(--color-text-light)' }}>
                <ShieldCheck size={12} className="shrink-0 mt-[1px]" aria-hidden /> {n}
              </li>
            ))}
          </ul>
        )}

        {info && <SourceChips sources={info.sources} />}

        {answer && !emergency && (
          <p className="m-0 mt-3 flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--color-text-light)' }}>
            <Cpu size={11} aria-hidden />
            {mode === 'ai' && 'Explained by an AI model running on your device. It can make mistakes — values above come directly from your records.'}
            {mode === 'records-only' && 'Records only — AI explanations are off.'}
            {mode === 'clarification' && 'Clarifying question'}
          </p>
        )}
      </div>
    </div>
  );
}
