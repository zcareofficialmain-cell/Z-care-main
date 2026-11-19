import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import AppNavbar from '@/components/navigation/AppNavbar';
import LoadingScreen from '@/components/ui/LoadingScreen';

export default function AppLayout() {
  const { user, loading, accountSuspended, signOut } = useAuth();

  if (loading) return <LoadingScreen />;
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

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-bg-page)' }}>
      <AppNavbar />
      <main>
        <Outlet />
      </main>
    </div>
  );
}
