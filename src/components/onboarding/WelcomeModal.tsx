import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { X, Upload, HeartPulse, Stethoscope, ArrowRight, Compass } from 'lucide-react';

export type WelcomeChoice = 'upload' | 'details' | 'doctor' | 'explore';

interface WelcomeModalProps {
  isOpen: boolean;
  /** Called after the closing animation. `explore` also covers X, Esc and clicking outside. */
  onChoose: (choice: WelcomeChoice) => void;
}

const OPTIONS: Array<{ id: Exclude<WelcomeChoice, 'explore'>; title: string; text: string; Icon: typeof Upload }> = [
  {
    id: 'upload',
    title: 'Upload Medical Reports',
    text: 'Upload your medical reports, prescriptions, blood tests, scans and discharge summaries.',
    Icon: Upload,
  },
  {
    id: 'details',
    title: 'Add Health Details',
    text: 'Add your medical conditions, allergies, current medications and other health information.',
    Icon: HeartPulse,
  },
  {
    id: 'doctor',
    title: 'Add Doctor History',
    text: 'Organise your previous doctor consultations and medical visits.',
    Icon: Stethoscope,
  },
];

const CLOSE_MS = 180;

export default function WelcomeModal({ isOpen, onChoose }: WelcomeModalProps) {
  const [closing, setClosing] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const chosen = useRef(false);

  const choose = (choice: WelcomeChoice) => {
    if (chosen.current) return;
    chosen.current = true;
    setClosing(true);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(() => onChoose(choice), reduced ? 0 : CLOSE_MS);
  };

  useEffect(() => {
    if (!isOpen) return;
    chosen.current = false;
    setClosing(false);
    returnFocus.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    // Focus the first option so keyboard users can start immediately.
    const t = window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>('[data-welcome-option]')?.focus(), 0);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = '';
      returnFocus.current?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Keep Tab inside the dialog; Esc closes it like "explore first".
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      choose('explore');
      return;
    }
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled])'));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className={`modal-overlay welcome-overlay${closing ? ' is-closing' : ''}`}
      onMouseDown={e => { if (e.target === e.currentTarget) choose('explore'); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        aria-describedby="welcome-desc"
        onKeyDown={onKeyDown}
        className={`welcome-dialog relative w-full${closing ? ' is-closing' : ''}`}
      >
        <button
          type="button"
          onClick={() => choose('explore')}
          className="btn-icon btn-ghost absolute top-3 right-3"
          aria-label="Close welcome"
        >
          <X size={20} />
        </button>

        <div className="text-center px-6 pt-9 pb-6 sm:px-10">
          <div
            className="mx-auto mb-4 flex items-center justify-center rounded-2xl"
            style={{ width: 60, height: 60, background: 'linear-gradient(135deg, var(--color-emerald-primary), var(--color-teal-deep))', color: '#fff' }}
            aria-hidden="true"
          >
            <HeartPulse size={30} />
          </div>
          <h2 id="welcome-title" className="text-2xl sm:text-3xl font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>
            Welcome to ZCare!
          </h2>
          <p id="welcome-desc" className="text-sm sm:text-base max-w-lg mx-auto" style={{ color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
            Your health journey starts here. Let's bring all your important health information together in one place.
          </p>
        </div>

        <div className="px-4 sm:px-8 grid gap-3">
          {OPTIONS.map(({ id, title, text, Icon }) => (
            <button
              key={id}
              type="button"
              data-welcome-option
              onClick={() => choose(id)}
              className="welcome-option w-full text-left flex items-center gap-4 p-4 rounded-xl border"
            >
              <span
                className="shrink-0 flex items-center justify-center rounded-xl"
                style={{ width: 46, height: 46, backgroundColor: 'var(--color-mint-soft)', color: 'var(--color-emerald-primary)' }}
                aria-hidden="true"
              >
                <Icon size={22} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-[15px]" style={{ color: 'var(--color-text-primary)' }}>{title}</span>
                <span className="block text-xs sm:text-sm mt-0.5" style={{ color: 'var(--color-text-muted)', lineHeight: 1.5 }}>{text}</span>
              </span>
              <ArrowRight size={18} className="welcome-option-arrow shrink-0" aria-hidden="true" />
            </button>
          ))}
        </div>

        <div className="px-6 pt-4 pb-7 text-center">
          <button
            type="button"
            onClick={() => choose('explore')}
            className="btn btn-ghost inline-flex items-center gap-2 text-sm font-semibold"
            style={{ color: 'var(--color-teal-deep)' }}
          >
            <Compass size={16} aria-hidden="true" />
            I'll explore ZCare first
          </button>
        </div>
      </div>
    </div>
  );
}
