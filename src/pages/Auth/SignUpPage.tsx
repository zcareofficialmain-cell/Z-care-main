import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, ArrowRight, Eye, EyeOff } from 'lucide-react';
import Logo from '@/components/ui/Logo';
import { useAuth } from '@/contexts/AuthContext';
import GoogleSignInButton from '@/components/auth/GoogleSignInButton';

export default function SignUpPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const { signUp, configured } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const { error: signUpError } = await signUp(email, password);
    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
    } else {
      if (!configured) {
        // Direct onboarding in local mode
        navigate('/profile');
      } else {
        setSuccess(true);
      }
    }
  };

  if (success) {
    return (
      <div className="card p-8 max-w-md w-full text-center shadow-lg border border-[var(--color-border)]">
        <div className="flex justify-center mb-4">
          <Logo size="md" />
        </div>
        <h2 className="text-xl font-bold mb-3">Check your email</h2>
        <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
          We sent a verification link to <strong>{email}</strong>. Please check your inbox and click the link to activate your account.
        </p>
        <button onClick={() => navigate('/signin')} className="btn btn-primary w-full">
          Go to Sign In
        </button>
      </div>
    );
  }

  return (
    <div className="card p-8 max-w-md w-full shadow-lg border border-[var(--color-border)]">
      <div className="flex justify-center mb-6">
        <Logo size="md" />
      </div>
      <h1 className="text-xl font-bold text-center mb-1">Create your account</h1>
      <p className="text-sm text-center mb-6" style={{ color: 'var(--color-text-muted)' }}>
        Start organising your health records today
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ backgroundColor: 'var(--color-danger-light)', color: 'var(--color-danger)' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="input-group">
          <label className="input-label" htmlFor="signup-email">Email</label>
          <div className="relative">
            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-light)' }} />
            <input
              id="signup-email"
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
          <label className="input-label" htmlFor="signup-password">Password</label>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-light)' }} />
            <input
              id="signup-password"
              type={showPassword ? 'text' : 'password'}
              className="input-field"
              style={{ paddingLeft: 36, paddingRight: 40 }}
              placeholder="At least 6 characters"
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

        <div className="input-group">
          <label className="input-label" htmlFor="signup-confirm-password">Confirm Password</label>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-light)' }} />
            <input
              id="signup-confirm-password"
              type={showPassword ? 'text' : 'password'}
              className="input-field"
              style={{ paddingLeft: 36 }}
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
            />
          </div>
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-lg w-full mt-2"
          disabled={loading}
        >
          {loading ? (
            <span className="spinner" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
          ) : (
            <>
              Get Started <ArrowRight size={16} />
            </>
          )}
        </button>
      </form>

      <GoogleSignInButton />

      <div className="mt-6 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
        Already have an account?{' '}
        <Link to="/signin" className="font-medium" style={{ color: 'var(--color-emerald-primary)' }}>
          Sign in
        </Link>
      </div>
    </div>
  );
}
