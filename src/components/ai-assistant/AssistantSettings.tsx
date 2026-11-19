import { useState } from 'react';
import { ExternalLink, Lock, Trash2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import type { HealthAssistant } from '@/hooks/useHealthAssistant';
import { EMBEDDING_MODEL, STANDARD_MODEL, downloadSizeMB } from '@/services/ai/models.config';

const formatMB = (mb: number) => (mb >= 1000 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`);

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-xs" style={{ borderBottom: '1px solid var(--color-border-light)' }}>
      <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <span className="text-right" style={{ color: 'var(--color-text-primary)' }}>{value}</span>
    </div>
  );
}

export default function AssistantSettings({ assistant, isOpen, onClose }: { assistant: HealthAssistant; isOpen: boolean; onClose: () => void }) {
  const { runtime, capabilities, prefs, phase, semantic, loadSeconds, dataSourceKind, actions } = assistant;
  const [forceCpu, setForceCpu] = useState(prefs.forceCpu);
  const [removing, setRemoving] = useState(false);
  const changed = forceCpu !== prefs.forceCpu;
  const aiOff = phase === 'records-only';

  const apply = () => {
    actions.setModelPreference(forceCpu);
    onClose();
  };
  const remove = async () => {
    setRemoving(true);
    try {
      await actions.removeDownloadedModels();
    } finally {
      setRemoving(false);
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Health Assistant settings" size="md">
      <div className="space-y-5 text-sm">
        <section>
          <h3 className="m-0 mb-2 text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
            <Lock size={15} style={{ color: 'var(--color-emerald-primary)' }} aria-hidden /> Privacy
          </h3>
          <ul className="m-0 pl-5 list-disc space-y-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            <li>The AI model runs inside this browser. Your questions and records are not sent to any AI service.</li>
            <li>
              {dataSourceKind === 'supabase'
                ? 'Records are read with your own login; the database only returns records that belong to you.'
                : dataSourceKind === 'demo'
                  ? 'You are using the demo account, so answers use ZCare’s sample records.'
                  : 'Records are read from this browser’s local storage.'}
            </li>
            <li>The conversation is kept in memory only. It is cleared when you clear it, reload the page or sign out.</li>
            <li>Model files are downloaded once from the Hugging Face CDN and stored in your browser’s cache.</li>
          </ul>
        </section>

        <section>
          <h3 className="m-0 mb-1 text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Current setup</h3>
          <Row label="Status" value={aiOff ? 'Records only (AI off)' : phase === 'ready' ? `Ready${loadSeconds ? ` · started in ${loadSeconds}s` : ''}` : phase.replace('-', ' ')} />
          {runtime && (
            <>
              <Row label="Model" value={`${runtime.model.name} (${runtime.variant.dtype})`} />
              <Row label="Runs on" value={runtime.variant.device === 'webgpu' ? 'Graphics chip (WebGPU)' : 'Processor (WebAssembly)'} />
              <Row label="Download size" value={`≈ ${formatMB(downloadSizeMB(runtime.variant))}`} />
            </>
          )}
          <Row label="Report search" value={semantic === 'on' ? `Keyword + semantic (${EMBEDDING_MODEL.name})` : semantic === 'loading' ? 'Keyword (semantic loading…)' : 'Keyword'} />
          {capabilities && (
            <Row
              label="This device"
              value={[
                capabilities.webgpu ? `WebGPU${capabilities.shaderF16 ? ' + fp16' : ''}` : 'No WebGPU',
                capabilities.gpuDescription,
                capabilities.deviceMemoryGB ? `${capabilities.deviceMemoryGB} GB RAM` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            />
          )}
          <p className="m-0 mt-2 text-[11px]" style={{ color: 'var(--color-text-light)' }}>
            Licences: {STANDARD_MODEL.name} —{' '}
            <a href={STANDARD_MODEL.licenseUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--color-emerald-primary)' }}>
              Apache-2.0 <ExternalLink size={10} className="inline" aria-hidden />
            </a>
            ; {EMBEDDING_MODEL.name} — Apache-2.0.
          </p>
        </section>

        {!aiOff && (
          <section>
            <h3 className="m-0 mb-2 text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>AI engine</h3>
            <div className="space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={forceCpu} onChange={e => { setForceCpu(e.target.checked); }} className="mt-1" />
                <span>
                  <span className="font-medium">Compatibility mode</span>{' '}
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>— run on the processor instead of the graphics chip (slower; use if the AI fails to start).</span>
                </span>
              </label>
            </div>
            <button type="button" className="btn btn-primary btn-sm mt-3" disabled={!changed} onClick={apply}>Apply</button>
          </section>
        )}

        <section className="flex flex-col sm:flex-row gap-2 pt-1">
          {aiOff ? (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => { actions.enableAi(); onClose(); }}>Turn on AI explanations</button>
          ) : (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => { actions.switchToRecordsOnly(); onClose(); }}>Switch to records-only mode</button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--color-danger)' }} disabled={removing} onClick={remove}>
            <Trash2 size={14} aria-hidden /> {removing ? 'Removing…' : 'Remove downloaded AI model'}
          </button>
        </section>
      </div>
    </Modal>
  );
}
