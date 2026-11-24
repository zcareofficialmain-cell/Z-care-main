import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Mail, Lock, ArrowRight, Eye, EyeOff, Sparkles } from 'lucide-react';
import Logo from '@/components/ui/Logo';
import { useAuth } from '@/contexts/AuthContext';
import GoogleSignInButton from '@/components/auth/GoogleSignInButton';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signInAsDemo, configured } = useAuth();
  const navigate = useNavigate();
  const notice = (useLocation().state as { message?: string } | null)?.message;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: signInError } = await signIn(email, password);

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
    } else {
      navigate('/dashboard');
    }
  };

  const handleDemoLogin = () => {
    signInAsDemo();
    navigate('/dashboard');
  };

  return (
    <div className="card p-8 max-w-md w-full shadow-lg border border-[var(--color-border)]">
      <div className="flex justify-center mb-6">
        <Logo size="md" />
      </div>
      <h1 className="text-xl font-bold text-center mb-1">Welcome back</h1>
      <p className="text-sm text-center mb-6" style={{ color: 'var(--color-text-muted)' }}>
        Sign in to access your secure health records
      </p>

      {/* Demo Account Quick Access Card */}
      <div
        className="mb-5 p-4 rounded-xl border flex flex-col gap-2.5"
        style={{
          backgroundColor: 'var(--color-mint-lighter)',
          borderColor: 'var(--color-border)',
        }}
      >
        <div className="flex items-center gap-2">
          <Sparkles size={16} style={{ color: 'var(--color-emerald-primary)' }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-teal-deep)' }}>
            Instant Evaluation & Demo Mode
          </span>
        </div>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Explore all 8 customer-specified screens with preloaded reference data (Aarav Sharma).
        </p>
        <button
          type="button"
          onClick={handleDemoLogin}
          className="btn btn-primary btn-sm w-full font-medium"
        >
          Sign In as Demo User (1-Click)
        </button>
      </div>

      {!configured && (
        <div className="mb-4 p-3 rounded-lg text-xs" style={{ backgroundColor: 'var(--color-info-light)', color: 'var(--color-info)' }}>
          <strong>Note:</strong> Supabase credentials not set in .env. Running in offline/demo mode with client persistence.
        </div>
      )}

      {notice && !error && (
        <div role="status" className="mb-4 p-3 rounded-lg text-sm" style={{ backgroundColor: 'var(--color-mint-lighter)', color: 'var(--color-teal-deep)' }}>
          {notice}
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ backgroundColor: 'var(--color-danger-light)', color: 'var(--color-danger)' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="input-group">
          <label className="input-label" htmlFor="signin-email">Email</label>
          <div className="relative">
            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-light)' }} />
            <input
              id="signin-email"
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

        <div className="input-group">
          <label className="input-label" htmlFor="signin-password">Password</label>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-light)' }} />
            <input
              id="signin-password"
              type={showPassword ? 'text' : 'password'}
              className="input-field"
              style={{ paddingLeft: 36, paddingRight: 40 }}
              placeholder="Your password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2"
              onClick={() => setShowPassword(!showPassword)}
              style={{ color: 'var(--color-text-light)', background: 'none', border: 'none', cursor: 'pointer' }}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div className="flex justify-end">
          <Link
            to="/forgot-password"
            className="text-sm font-medium"
            style={{ color: 'var(--color-emerald-primary)' }}
          >
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-lg w-full"
          disabled={loading}
        >
          {loading ? (
            <span className="spinner" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
          ) : (
            <>
              Sign In <ArrowRight size={16} />
            </>
          )}
        </button>
      </form>

      <GoogleSignInButton />

      <div className="mt-6 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
        Don&apos;t have an account?{' '}
        <Link to="/signup" className="font-medium" style={{ color: 'var(--color-emerald-primary)' }}>
          Sign up
        </Link>
      </div>
    </div>
  );
}
