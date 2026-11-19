import { useState } from 'react';
import { Cpu, ListChecks, Settings2, Sparkles, Trash2, Zap } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useHealthAssistant, type HealthAssistant } from '@/hooks/useHealthAssistant';
import AIHealthDisclaimer from '@/components/ai-assistant/AIHealthDisclaimer';
import AssistantSettings from '@/components/ai-assistant/AssistantSettings';
import ChatWindow from '@/components/ai-assistant/ChatWindow';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

function StatusPill({ assistant }: { assistant: HealthAssistant }) {
  const { phase, runtime } = assistant;
  if (phase === 'ready' && runtime) {
    const gpu = runtime.variant.device === 'webgpu';
    return (
      <span className="badge badge-emerald hidden sm:inline-flex" title={gpu ? 'Running on the graphics chip (WebGPU)' : 'Running on the processor (WebAssembly)'}>
        {gpu ? <Zap size={12} aria-hidden /> : <Cpu size={12} aria-hidden />} On-device AI
      </span>
    );
  }
  if (phase === 'records-only') {
    return (
      <span className="badge badge-neutral hidden sm:inline-flex">
        <ListChecks size={12} aria-hidden /> Records only
      </span>
    );
  }
  return null;
}

export default function AssistantPage() {
  const { user, isDemoUser } = useAuth();
  // AppLayout only renders this page for a signed-in user.
  const assistant = useHealthAssistant({ userId: user?.id ?? 'anonymous', isDemoUser });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const hasMessages = assistant.messages.length > 0;

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 pt-4 pb-3 sm:pt-6 sm:pb-5 flex flex-col gap-3" style={{ height: 'calc(100dvh - 56px)' }}>
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center justify-center rounded-xl shrink-0" style={{ width: 40, height: 40, backgroundColor: 'var(--color-mint-soft)' }} aria-hidden>
            <Sparkles size={20} style={{ color: 'var(--color-emerald-primary)' }} />
          </div>
          <div className="min-w-0">
            <h1 className="m-0 text-xl md:text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
              Health Assistant
            </h1>
            <p className="m-0 text-xs md:text-sm truncate" style={{ color: 'var(--color-text-muted)' }}>
              {isDemoUser ? 'Demo account · answers use ZCare sample records' : 'Personal answers from your ZCare records'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <StatusPill assistant={assistant} />
          <button type="button" className="btn-icon btn-ghost btn" onClick={() => setSettingsOpen(true)} aria-label="Assistant settings" title="Settings">
            <Settings2 size={18} />
          </button>
          <button
            type="button"
            className="btn-icon btn-ghost btn"
            onClick={() => setConfirmClear(true)}
            disabled={!hasMessages}
            aria-label="Clear conversation"
            title="Clear conversation"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </header>

      <AIHealthDisclaimer />
      <ChatWindow assistant={assistant} />

      {settingsOpen && <AssistantSettings assistant={assistant} isOpen onClose={() => setSettingsOpen(false)} />}
      <ConfirmDialog
        isOpen={confirmClear}
        onCancel={() => setConfirmClear(false)}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => {
          assistant.actions.clear();
          setConfirmClear(false);
        }}
        title="Clear this conversation?"
        message="The questions and answers on this screen will be removed. Your health records are not affected."
        confirmText="Clear conversation"
        variant="warning"
      />
    </div>
  );
}
