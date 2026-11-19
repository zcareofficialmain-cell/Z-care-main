import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import Logo from '@/components/ui/Logo';
import LoadingScreen from '@/components/ui/LoadingScreen';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, initialAuthRedirect } from '@/lib/supabase';

/**
 * Return point for "Continue with Google". Supabase has already turned the
 * redirect into a session (detectSessionInUrl). This page only decides where
 * the user goes next:
 *   - existing ZCare profile -> dashboard (profile is left untouched)
 *   - no profile yet         -> the existing onboarding page (/profile)
 */
export default function AuthCallbackPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [problem, setProblem] = useState<string | null>(() =>
    initialAuthRedirect.error || initialAuthRedirect.errorCode
      ? initialAuthRedirect.error === 'access_denied'
        ? 'Google sign-in was cancelled.'
        : 'Google sign-in could not be completed. Please try again.'
      : null,
  );

  useEffect(() => {
    if (loading || problem) return;
    if (!user) {
      setProblem('Google sign-in could not be completed. Please try again.');
      return;
    }
    let cancelled = false;
    (async () => {
      // Identity comes from the Supabase session; the profile lookup is limited to it by RLS.
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (cancelled) return;
      if (authError || !auth.user) {
        setProblem('Your sign-in session could not be verified. Please try again.');
        return;
      }
      const { data, error } = await supabase.from('profiles').select('id, full_name').eq('user_id', auth.user.id).maybeSingle();
      if (cancelled) return;
      if (error) {
        setProblem('Signed in, but your profile could not be loaded. Please try again.');
        return;
      }
      navigate(data?.full_name ? '/dashboard' : '/profile', { replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, user, problem, navigate]);

  if (!problem) return <LoadingScreen />;

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--color-bg-page)' }}>
      <div className="card p-8 max-w-md w-full text-center">
        <div className="flex justify-center mb-6">
          <Logo size="md" />
        </div>
        <AlertTriangle size={36} className="mx-auto mb-3" style={{ color: 'var(--color-warning, #d97706)' }} />
        <h1 className="text-xl font-bold mb-2">Sign-in not completed</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>{problem}</p>
        <Link to="/signin" replace className="btn btn-primary w-full inline-flex">Back to Sign In</Link>
      </div>
    </div>
  );
}
