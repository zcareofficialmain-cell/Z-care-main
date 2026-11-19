import { useState, type ReactNode } from 'react';
import { AlertTriangle, Cpu, Download, ListChecks, MonitorSmartphone, Sparkles, Zap } from 'lucide-react';
import type { HealthAssistant } from '@/hooks/useHealthAssistant';
import { STANDARD_MODEL, downloadSizeMB } from '@/services/ai/models.config';

const formatMB = (mb: number) => (mb >= 1000 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`);

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-1" role="status" aria-live="polite">
      <div className="spinner" aria-hidden />
      <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
    </div>
  );
}

function Panel({ children, tone = 'mint' }: { children: ReactNode; tone?: 'mint' | 'danger' }) {
  return (
    <div
      className="rounded-xl p-4 sm:p-5 text-sm"
      style={{
        backgroundColor: tone === 'danger' ? 'var(--color-danger-light)' : 'var(--color-bg-card)',
        border: `1px solid ${tone === 'danger' ? '#FECACA' : 'var(--color-border)'}`,
        boxShadow: 'var(--shadow-card)',
      }}
    >
      {children}
    </div>
  );
}

/** Shown inside the conversation until the on-device model is ready. */
export default function ModelLoading({ assistant }: { assistant: HealthAssistant }) {
  const { phase, runtime, capabilities, progress, error, downloadMB, actions } = assistant;
  const [showDetail, setShowDetail] = useState(false);
  const onGpu = runtime?.variant.device === 'webgpu';
  const cpuFallbackMB = downloadSizeMB(STANDARD_MODEL.variants.wasm!);

  switch (phase) {
    case 'detecting':
      return <Panel><Spinner label="Checking what this device can run…" /></Panel>;

    case 'checking-cache':
      return <Panel><Spinner label="Looking for the AI model on this device…" /></Panel>;

    case 'needs-consent':
      return (
        <Panel>
          <div className="flex items-start gap-3">
            <div className="hidden sm:flex items-center justify-center rounded-lg shrink-0" style={{ width: 36, height: 36, backgroundColor: 'var(--color-mint-soft)' }}>
              <Download size={18} style={{ color: 'var(--color-emerald-primary)' }} aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="m-0 text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>Set up your private health assistant</h3>
              <p className="m-0 mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
                To keep your records private, the assistant&apos;s AI runs entirely on this device — your records are never sent to an AI
                service. It needs a <strong style={{ color: 'var(--color-text-primary)' }}>one-time download of about {formatMB(downloadMB ?? 0)}</strong>,
                saved in your browser for next time. Wi-Fi is recommended.
              </p>
              <p className="m-0 mt-2 flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {onGpu ? <Zap size={13} aria-hidden /> : <Cpu size={13} aria-hidden />}
                {onGpu
                  ? `This device: GPU acceleration available (WebGPU)${capabilities?.gpuDescription ? ` · ${capabilities.gpuDescription}` : ''}`
                  : 'This device: processor only (slower answers)'}
              </p>
              {capabilities && capabilities.warnings.length > 0 && (
                <ul className="m-0 mt-2 pl-0 list-none space-y-1">
                  {capabilities.warnings.map((w, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs" style={{ color: 'var(--color-warning)' }}>
                      <AlertTriangle size={12} className="shrink-0 mt-[2px]" aria-hidden /> {w}
                    </li>
                  ))}
                </ul>
              )}
              {capabilities?.storageAvailableMB !== null && capabilities?.storageAvailableMB !== undefined && downloadMB !== null && capabilities.storageAvailableMB < downloadMB * 1.1 && (
                <p className="m-0 mt-2 flex items-start gap-1.5 text-xs" style={{ color: 'var(--color-danger)' }}>
                  <AlertTriangle size={12} className="shrink-0 mt-[2px]" aria-hidden /> Your browser reports only {formatMB(capabilities.storageAvailableMB)} of free storage, which may not be enough.
                </p>
              )}
              <div className="flex flex-col sm:flex-row gap-2 mt-4">
                <button type="button" className="btn btn-primary" onClick={actions.startDownload}>
                  <Sparkles size={16} aria-hidden /> Download and start ({formatMB(downloadMB ?? 0)})
                </button>
                <button type="button" className="btn btn-outline" onClick={actions.switchToRecordsOnly}>
                  <ListChecks size={16} aria-hidden /> Use records-only mode
                </button>
              </div>
              <p className="m-0 mt-2 text-[11px]" style={{ color: 'var(--color-text-light)' }}>
                Records-only mode answers by listing the relevant records, without AI explanations or a download.
              </p>
            </div>
          </div>
        </Panel>
      );

    case 'downloading':
      return (
        <Panel>
          <p className="m-0 font-semibold" style={{ color: 'var(--color-text-primary)' }}>Downloading the AI model…</p>
          <div className="ai-progress-track mt-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress?.percent ?? 0} aria-label="Model download progress">
            <div className="ai-progress-bar" style={{ width: `${progress?.percent ?? 0}%` }} />
          </div>
          <p className="m-0 mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {progress ? `${formatMB(progress.loadedMB)} of ${formatMB(progress.totalMB)} (${progress.percent}%)` : 'Starting…'} · Keep this page open. Next time it loads from your device.
          </p>
        </Panel>
      );

    case 'initializing':
      return (
        <Panel>
          <Spinner label="Starting the AI model on your device… The first start can take up to a minute." />
        </Panel>
      );

    case 'error':
      return (
        <Panel tone="danger">
          <p className="m-0 font-semibold flex items-center gap-2" style={{ color: 'var(--color-danger)' }}>
            <AlertTriangle size={16} aria-hidden /> {error?.summary ?? 'The AI model could not be started.'}
          </p>
          <p className="m-0 mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
            Your records were not sent anywhere. You can try again{onGpu && capabilities?.wasmSimd ? ', run the model on the processor instead' : ''}, or use records-only mode.
          </p>
          <div className="flex flex-col sm:flex-row flex-wrap gap-2 mt-3">
            {onGpu && capabilities?.wasmSimd && (
              <button type="button" className="btn btn-primary" onClick={actions.switchToCpu}>
                <Cpu size={16} aria-hidden /> Try compatibility mode ({formatMB(cpuFallbackMB)})
              </button>
            )}
            <button type="button" className="btn btn-outline" onClick={actions.retry}>Try again</button>
            <button type="button" className="btn btn-outline" onClick={actions.switchToRecordsOnly}>
              <ListChecks size={16} aria-hidden /> Use records-only mode
            </button>
          </div>
          {error?.detail && (
            <div className="mt-3">
              <button type="button" className="text-xs underline" style={{ color: 'var(--color-text-muted)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }} onClick={() => setShowDetail(v => !v)}>
                {showDetail ? 'Hide technical details' : 'Show technical details'}
              </button>
              {showDetail && <pre className="mt-2 mb-0 text-[11px] whitespace-pre-wrap break-words" style={{ color: 'var(--color-text-muted)' }}>{error.detail}</pre>}
            </div>
          )}
        </Panel>
      );

    case 'unsupported':
      return (
        <Panel>
          <p className="m-0 font-semibold flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
            <MonitorSmartphone size={16} aria-hidden /> This browser can&apos;t run the on-device AI model
          </p>
          <ul className="m-0 mt-2 pl-5 list-disc text-xs space-y-1" style={{ color: 'var(--color-text-muted)' }}>
            {(capabilities?.warnings.length ? capabilities.warnings : ['WebGPU and WebAssembly SIMD are both unavailable.']).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          <p className="m-0 mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Try a current version of Chrome, Edge or Safari. You can still use records-only mode — nothing is sent to a cloud AI service.
          </p>
          <button type="button" className="btn btn-primary mt-3" onClick={actions.switchToRecordsOnly}>
            <ListChecks size={16} aria-hidden /> Use records-only mode
          </button>
        </Panel>
      );

    default:
      return null;
  }
}
