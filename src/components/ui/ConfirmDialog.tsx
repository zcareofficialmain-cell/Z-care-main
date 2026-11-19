import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose?: () => void;
  onCancel?: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  confirmLabel?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning';
  loading?: boolean;
}

export default function ConfirmDialog({
  isOpen,
  onClose,
  onCancel,
  onConfirm,
  title,
  message,
  confirmText,
  confirmLabel,
  cancelText = 'Cancel',
  variant = 'danger',
  loading = false,
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  const closeHandler = onCancel || onClose || (() => {});
  const buttonText = confirmLabel || confirmText || 'Delete';

  return (
    <div className="modal-overlay" onClick={closeHandler}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
        <div className="modal-body text-center">
          <div
            className="mx-auto mb-4 flex items-center justify-center rounded-full"
            style={{
              width: 56,
              height: 56,
              backgroundColor: variant === 'danger' ? '#FEF2F2' : '#FFFBEB',
            }}
          >
            <AlertTriangle
              size={28}
              style={{ color: variant === 'danger' ? '#DC2626' : '#D97706' }}
            />
          </div>
          <h3 className="text-lg font-semibold mb-2">{title}</h3>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{message}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={closeHandler} disabled={loading}>
            {cancelText}
          </button>
          <button
            className={`btn ${variant === 'danger' ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading && <span className="spinner" style={{ width: 14, height: 14, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />}
            {buttonText}
          </button>
        </div>
      </div>
    </div>
  );
}
