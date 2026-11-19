import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

/** Google "G" mark (brand colours, as Google's sign-in guidelines require). */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}

/** "OR" divider + "Continue with Google" (Supabase OAuth). */
export default function GoogleSignInButton() {
  const { signInWithGoogle, configured } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const start = async () => {
    setError('');
    setLoading(true);
    const { error: oauthError } = await signInWithGoogle();
    // On success the browser leaves for Google, so loading stays on.
    if (oauthError) {
      setLoading(false);
      setError(/provider is not enabled|unsupported provider/i.test(oauthError.message) ? 'Google sign-in is not enabled for ZCare yet.' : oauthError.message);
    }
  };

  return (
    <div className="mt-5">
      <div className="flex items-center gap-3 mb-4" aria-hidden="true">
        <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-border)' }} />
        <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-light)' }}>or</span>
        <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-border)' }} />
      </div>
      {error && (
        <div role="alert" className="mb-3 p-3 rounded-lg text-sm" style={{ backgroundColor: 'var(--color-danger-light)', color: 'var(--color-danger)' }}>
          {error}
        </div>
      )}
      <button
        type="button"
        onClick={start}
        disabled={loading || !configured}
        className="btn btn-outline btn-lg w-full flex items-center justify-center gap-2"
        title={configured ? undefined : 'Google sign-in needs the online (Supabase) version of ZCare'}
      >
        {loading ? <span className="spinner" /> : <GoogleIcon />}
        <span>Continue with Google</span>
      </button>
    </div>
  );
}
