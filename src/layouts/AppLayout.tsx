import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import AppNavbar from '@/components/navigation/AppNavbar';
import LoadingScreen from '@/components/ui/LoadingScreen';

export default function AppLayout() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/signin" replace />;

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-bg-page)' }}>
      <AppNavbar />
      <main>
        <Outlet />
      </main>
    </div>
  );
}
