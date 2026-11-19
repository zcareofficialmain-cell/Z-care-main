import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft } from 'lucide-react';
import Logo from '@/components/ui/Logo';
import { useAuth } from '@/contexts/AuthContext';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { resetPassword, configured } = useAuth();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!configured) {
      setError('Supabase is not configured.');
      return;
    }

    setLoading(true);
    const { error: resetError } = await resetPassword(email);
    setLoading(false);

    if (resetError) {
      setError(resetError.message);
    } else {
      setSent(true);
    }
  };

  if (sent) {
    return (
      <div className="card p-8 max-w-md w-full text-center">
        <div className="flex justify-center mb-4">
          <Logo size="md" />
        </div>
        <h2 className="text-xl font-bold mb-3">Check your email</h2>
        <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
          We sent a password reset link to <strong>{email}</strong>.
        </p>
        <Link to="/signin" className="btn btn-primary w-full inline-flex">
          <ArrowLeft size={16} />
          Back to Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="card p-8 max-w-md w-full">
      <div className="flex justify-center mb-6">
        <Logo size="md" />
      </div>
      <h1 className="text-xl font-bold text-center mb-1">Forgot password?</h1>
      <p className="text-sm text-center mb-6" style={{ color: 'var(--color-text-muted)' }}>
        Enter your email and we&apos;ll send you a reset link
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ backgroundColor: 'var(--color-danger-light)', color: 'var(--color-danger)' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="input-group">
          <label className="input-label" htmlFor="forgot-email">Email</label>
          <div className="relative">
            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-light)' }} />
            <input
              id="forgot-email"
              type="email"
              className="input-field"
              style={{ paddingLeft: 36 }}
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
        </div>

        <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading || !configured}>
          {loading ? (
            <span className="spinner" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
          ) : (
            'Send Reset Link'
          )}
        </button>
      </form>

      <p className="text-sm text-center mt-6">
        <Link to="/signin" className="font-medium flex items-center justify-center gap-1" style={{ color: 'var(--color-emerald-primary)' }}>
          <ArrowLeft size={14} />
          Back to Sign In
        </Link>
      </p>
    </div>
  );
}
