import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, CheckCircle2, AlertTriangle } from 'lucide-react';
import Logo from '@/components/ui/Logo';
import LoadingScreen from '@/components/ui/LoadingScreen';
import { useAuth } from '@/contexts/AuthContext';
import { initialAuthRedirect } from '@/lib/supabase';

/** Same rule as sign-up (and Supabase's default minimum). */
const MIN_PASSWORD_LENGTH = 6;

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--color-bg-page)' }}>
      <div className="card p-8 max-w-md w-full">
        <div className="flex justify-center mb-6">
          <Logo size="md" />
        </div>
        {children}
      </div>
    </div>
  );
}

function linkProblem(): string | null {
  const { error, errorCode, errorDescription } = initialAuthRedirect;
  if (!error && !errorCode) return null;
  if (errorCode === 'otp_expired' || /expired/i.test(errorDescription ?? '')) {
    return 'This password reset link has expired. Reset links can only be used once and for a limited time.';
  }
  return 'This password reset link is invalid or has already been used.';
}

export default function ResetPasswordPage() {
  const { user, loading, recoveryMode, configured, completePasswordRecovery, cancelPasswordRecovery } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  // After success, continue to sign-in with the new password.
  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => navigate('/signin', { replace: true, state: { message: 'Your password was updated. Please sign in with your new password.' } }), 2500);
    return () => window.clearTimeout(t);
  }, [done, navigate]);

  if (loading) return <LoadingScreen />;

  if (done) {
    return (
      <Shell>
        <div className="text-center">
          <CheckCircle2 size={40} className="mx-auto mb-3" style={{ color: 'var(--color-emerald-primary)' }} />
          <h1 className="text-xl font-bold mb-2">Password updated</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
            Your password was changed successfully. Taking you to sign in…
          </p>
          <Link to="/signin" replace className="btn btn-primary w-full inline-flex">Go to Sign In</Link>
        </div>
      </Shell>
    );
  }

  const problem = linkProblem();
  // A usable recovery session is required: arriving from the reset link (in any browser) provides one.
  if (!configured || problem || !recoveryMode || !user) {
    const message = !configured
      ? 'Password reset needs the online (Supabase) version of ZCare.'
      : problem ?? (user ? 'This page only works from a password reset link. To change your password, request a reset link.' : 'This password reset link is invalid or has expired. Please request a new one.');
    return (
      <Shell>
        <div className="text-center">
          <AlertTriangle size={36} className="mx-auto mb-3" style={{ color: 'var(--color-warning, #d97706)' }} />
          <h1 className="text-xl font-bold mb-2">Reset link not valid</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>{message}</p>
          <Link to="/forgot-password" className="btn btn-primary w-full inline-flex mb-3">Request a new reset link</Link>
          <Link to={user ? '/dashboard' : '/signin'} className="text-sm font-medium" style={{ color: 'var(--color-emerald-primary)' }}>
            {user ? 'Back to dashboard' : 'Back to Sign In'}
          </Link>
        </div>
      </Shell>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!password.trim() || !confirmPassword.trim()) {
      setError('Please enter and confirm your new password.');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSaving(true);
    const { error: updateError } = await completePasswordRecovery(password);
    setSaving(false);
    if (updateError) {
      setError(
        /session|jwt|expired|not authenticated/i.test(updateError.message)
          ? 'Your reset session has expired. Please request a new reset link.'
          : updateError.message,
      );
      return;
    }
    setPassword('');
    setConfirmPassword('');
    setDone(true);
  };

  const cancel = async () => {
    await cancelPasswordRecovery();
    navigate('/signin', { replace: true });
  };

  const field = (
    id: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    shown: boolean,
    toggle: () => void,
    placeholder: string,
    autoComplete: string,
  ) => (
    <div className="input-group">
      <label className="input-label" htmlFor={id}>{label}</label>
      <div className="relative">
        <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-light)' }} />
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          className="input-field"
          style={{ paddingLeft: 36, paddingRight: 40 }}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          autoComplete={autoComplete}
          required
          minLength={MIN_PASSWORD_LENGTH}
        />
        <button
          type="button"
          onClick={toggle}
          className="absolute right-3 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--color-text-light)' }}
          aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        >
          {shown ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );

  return (
    <Shell>
      <h1 className="text-xl font-bold text-center mb-1">Set a new password</h1>
      <p className="text-sm text-center mb-6" style={{ color: 'var(--color-text-muted)' }}>
        Choose a new password for {user.email ?? 'your account'}.
      </p>

      {error && (
        <div role="alert" className="mb-4 p-3 rounded-lg text-sm" style={{ backgroundColor: 'var(--color-danger-light)', color: 'var(--color-danger)' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {field('reset-password', 'New Password', password, setPassword, showPassword, () => setShowPassword(v => !v), `At least ${MIN_PASSWORD_LENGTH} characters`, 'new-password')}
        {field('reset-confirm', 'Confirm New Password', confirmPassword, setConfirmPassword, showConfirm, () => setShowConfirm(v => !v), 'Repeat your new password', 'new-password')}
        {confirmPassword && password !== confirmPassword && (
          <p className="text-xs -mt-2" style={{ color: 'var(--color-danger)' }}>Passwords do not match yet.</p>
        )}

        <button type="submit" className="btn btn-primary btn-lg w-full mt-2" disabled={saving}>
          {saving ? <span className="spinner" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} /> : 'Submit New Password'}
        </button>
      </form>

      <button type="button" onClick={cancel} className="text-sm font-medium w-full mt-5" style={{ color: 'var(--color-text-muted)' }}>
        Cancel and return to Sign In
      </button>
    </Shell>
  );
}
