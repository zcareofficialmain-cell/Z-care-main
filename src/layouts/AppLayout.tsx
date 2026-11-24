import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import AppNavbar from '@/components/navigation/AppNavbar';
import LoadingScreen from '@/components/ui/LoadingScreen';

export default function AppLayout() {
  const { user, profile, hasAccess, loading, onboardingLoading, accountSuspended, isDemoUser, adminRole, signOut } = useAuth();

  // Wait until all authentication and onboarding information is completely loaded.
  if (loading || onboardingLoading) return <LoadingScreen />;
  if (!user) return <Navigate to="/signin" replace />;
  if (accountSuspended) {
    // Data access is already blocked by the database; this explains it to the user.
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--color-bg-page)' }}>
        <div className="card p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-bold mb-2">Account deactivated</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
            Your ZCare account has been deactivated by an administrator. Your records are kept safely. Please contact ZCare support if you think this is a mistake.
          </p>
          <button className="btn btn-primary w-full" onClick={() => void signOut()}>Sign out</button>
        </div>
      </div>
    );
  }

  // Demo users and administrators are exempt from patient onboarding subscription checks.
  const isExempt = isDemoUser || adminRole !== null;
  if (!isExempt) {
    // Step 1: Ensure profile is complete (full_name is required)
    if (!profile?.full_name || !profile.full_name.trim()) {
      return <Navigate to="/profile" replace />;
    }

    // Step 2: Ensure user has an active 24-hr trial or paid subscription
    if (!hasAccess) {
      return <Navigate to="/plans" replace />;
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-bg-page)' }}>
      <AppNavbar />
      <main>
        <Outlet />
      </main>
    </div>
  );
}
