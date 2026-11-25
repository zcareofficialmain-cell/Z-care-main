import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import Logo from '@/components/ui/Logo';
import LoadingScreen from '@/components/ui/LoadingScreen';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, initialAuthRedirect } from '@/lib/supabase';
import { getMembership } from '@/services/api';
import { membershipState } from '@/lib/plans';

/**
 * Return point for email verification and "Continue with Google".
 * Supabase has already turned the redirect into a session (detectSessionInUrl).
 * This page decides where the user goes next based on onboarding completion:
 *   - incomplete profile      -> /profile
 *   - no active trial or plan -> /plans
 *   - fully onboarded         -> /dashboard
 */
export default function AuthCallbackPage() {
  const { user, loading, refreshProfile, refreshMembership } = useAuth();
  const navigate = useNavigate();
  const [problem, setProblem] = useState<string | null>(() =>
    initialAuthRedirect.error || initialAuthRedirect.errorCode
      ? initialAuthRedirect.error === 'access_denied'
        ? 'Sign-in was cancelled.'
        : 'Sign-in could not be completed. Please try again.'
      : null,
  );

  useEffect(() => {
    if (loading || problem) return;
    if (!user) {
      setProblem('Sign-in or email verification could not be completed. Please try again.');
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

      const [profileRes, membershipRes, roleRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name').eq('user_id', auth.user.id).maybeSingle(),
        getMembership(auth.user.id).catch(() => membershipState([])),
        supabase.rpc('zc_my_admin_role'),
      ]);
      if (cancelled) return;

      if (profileRes.error) {
        setProblem('Signed in, but your profile could not be loaded. Please try again.');
        return;
      }

      // Sync state into AuthContext
      await Promise.all([refreshProfile(), refreshMembership()]);
      if (cancelled) return;

      // Administrators go straight to the Admin Dashboard
      if (!roleRes.error && (roleRes.data === 'super_admin' || roleRes.data === 'admin')) {
        navigate('/admin', { replace: true });
        return;
      }

      // Onboarding Step 1: Profile completion
      if (!profileRes.data?.full_name || !profileRes.data.full_name.trim()) {
        navigate('/profile', { replace: true });
        return;
      }

      // Onboarding Step 2: Plan selection (24-hr trial or paid subscription)
      if (!membershipRes.hasAccess) {
        navigate('/plans', { replace: true });
        return;
      }

      // Onboarding Complete
      navigate('/dashboard', { replace: true });
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, user, problem, navigate, refreshProfile, refreshMembership]);

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
