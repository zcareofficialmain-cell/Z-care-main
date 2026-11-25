import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import LoadingScreen from '@/components/ui/LoadingScreen';

export default function AuthLayout() {
  const { user, profile, hasAccess, loading, onboardingLoading, accessLoading, isDemoUser, adminRole } = useAuth();

  if (loading || onboardingLoading || accessLoading) return <LoadingScreen />;

  if (user) {
    if (!isDemoUser && adminRole !== null) {
      return <Navigate to="/admin" replace />;
    }
    if (!isDemoUser) {
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
