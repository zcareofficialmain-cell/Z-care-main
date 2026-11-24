import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import LoadingScreen from '@/components/ui/LoadingScreen';

export default function AuthLayout() {
  const { user, profile, hasAccess, loading, onboardingLoading, isDemoUser, adminRole } = useAuth();

  if (loading || onboardingLoading) return <LoadingScreen />;

  if (user) {
    const isExempt = isDemoUser || adminRole !== null;
    if (!isExempt) {
      if (!profile?.full_name || !profile.full_name.trim()) {
        return <Navigate to="/profile" replace />;
      }
      if (!hasAccess) {
        return <Navigate to="/plans" replace />;
      }
    }
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--color-bg-page)' }}>
      <Outlet />
    </div>
  );
}
