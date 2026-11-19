// ============================================================
// ZCare Scan Progress Indicator
// Displays multi-step visual progress for report scanning
// Emerald (#006B55), Teal (#003E38), Mint (#E8F5F0) styling
// ============================================================

import React from 'react';
import {
  Upload,
  FileSearch,
  Cpu,
  FolderKanban,
  GitCompare,
  CheckCircle2,
  AlertCircle,
  XCircle,
  RotateCw,
} from 'lucide-react';
import type { ExtractionProgress } from '@/types/medicalExtraction';

interface ScanProgressIndicatorProps {
  progress: ExtractionProgress;
  fileName: string;
  error?: string | null;
  onCancel?: () => void;
  onRetry?: () => void;
}

const STEPS = [
  { step: 1, label: 'Uploading document', icon: Upload },
  { step: 2, label: 'Reading medical report', icon: FileSearch },
  { step: 3, label: 'Scanning medical information', icon: Cpu },
  { step: 4, label: 'Organising extracted details', icon: FolderKanban },
  { step: 5, label: 'Checking existing records', icon: GitCompare },
  { step: 6, label: 'Ready for review', icon: CheckCircle2 },
];

export default function ScanProgressIndicator({
  progress,
  fileName,
  error,
  onCancel,
  onRetry,
}: ScanProgressIndicatorProps) {
  return (
    <div className="card p-6 shadow-sm border border-[var(--color-border)] bg-white max-w-xl mx-auto">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--color-border-light)]">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider block" style={{ color: 'var(--color-emerald-primary)' }}>
            AUTOMATIC DOCUMENT SCANNING
          </span>
          <h3 className="text-base font-bold text-[var(--color-text-primary)]">
            Processing: {fileName}
          </h3>
        </div>
        {onCancel && !error && (
          <button
            onClick={onCancel}
            className="text-xs text-[var(--color-text-muted)] hover:text-red-600 flex items-center gap-1 transition-colors"
          >
            <XCircle size={14} /> Cancel
          </button>
        )}
      </div>

      {error ? (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 space-y-3">
          <div className="flex items-start gap-2.5">
            <AlertCircle size={20} className="shrink-0 text-red-600 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">Processing Encountered an Issue</p>
              <p className="text-xs text-red-700 mt-0.5">{error}</p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="btn btn-outline btn-sm text-xs bg-white"
              >
                Close
              </button>
            )}
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="btn btn-primary btn-sm text-xs flex items-center gap-1.5"
              >
                <RotateCw size={12} /> Retry Scan
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-xs font-semibold mb-1.5">
              <span style={{ color: 'var(--color-teal-deep)' }}>
                {progress.label}
              </span>
              <span style={{ color: 'var(--color-emerald-primary)' }}>
                {progress.percentage}%
              </span>
            </div>
            <div className="w-full bg-[var(--color-mint-soft)] rounded-full h-2.5 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${progress.percentage}%`,
                  backgroundColor: 'var(--color-emerald-primary)',
                }}
              />
            </div>
            {progress.detail && (
              <p className="text-xs text-[var(--color-text-muted)] mt-1.5">
                {progress.detail}
              </p>
            )}
          </div>

          {/* Stepper list */}
          <div className="space-y-2.5 pt-2">
            {STEPS.map(s => {
              const Icon = s.icon;
              const isCompleted = progress.step > s.step;
              const isCurrent = progress.step === s.step;

              return (
                <div
                  key={s.step}
                  className={`flex items-center gap-3 p-2.5 rounded-lg text-xs transition-colors ${
                    isCurrent
                      ? 'bg-[var(--color-mint-soft)] font-semibold text-[var(--color-teal-deep)]'
                      : isCompleted
                      ? 'text-[var(--color-text-primary)] opacity-90'
                      : 'text-[var(--color-text-light)] opacity-60'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs ${
                      isCompleted
                        ? 'bg-[var(--color-emerald-primary)] text-white'
                        : isCurrent
                        ? 'border-2 border-[var(--color-emerald-primary)] text-[var(--color-emerald-primary)]'
                        : 'border border-[var(--color-border)] text-[var(--color-text-light)]'
                    }`}
                  >
                    {isCompleted ? <CheckCircle2 size={14} /> : s.step}
                  </div>

                  <div className="flex items-center gap-2 flex-1">
                    <Icon size={14} className={isCurrent ? 'text-[var(--color-emerald-primary)]' : ''} />
                    <span>{s.label}</span>
                  </div>

                  {isCurrent && (
                    <span className="spinner spinner-sm shrink-0" style={{ width: 14, height: 14 }} />
                  )}
                </div>
              );
            })}
          </div>

          <div className="p-3 rounded-lg bg-[var(--color-mint-soft)]/50 text-[11px] text-[var(--color-teal-deep)] flex items-center justify-between">
            <span>Client-side, privacy-preserving processing</span>
            <span className="font-semibold">No external AI API required</span>
          </div>
        </div>
      )}
    </div>
  );
}

