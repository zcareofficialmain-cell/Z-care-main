import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ToastProvider } from '@/components/ui/Toast';

import AuthLayout from '@/layouts/AuthLayout';
import LoadingScreen from '@/components/ui/LoadingScreen';
import AppLayout from '@/layouts/AppLayout';

import LandingPage from '@/pages/Landing/LandingPage';
import SignInPage from '@/pages/Auth/SignInPage';
import SignUpPage from '@/pages/Auth/SignUpPage';
import ForgotPasswordPage from '@/pages/Auth/ForgotPasswordPage';
import ResetPasswordPage from '@/pages/Auth/ResetPasswordPage';
import AuthCallbackPage from '@/pages/Auth/AuthCallbackPage';
import ProfilePage from '@/pages/Profile/ProfilePage';
import PlansPage from '@/pages/Plans/PlansPage';

import DashboardPage from '@/pages/Dashboard/DashboardPage';
import MedicationsPage from '@/pages/Medications/MedicationsPage';
import InsurancePage from '@/pages/Insurance/InsurancePage';
import ConsultationsPage from '@/pages/Consultations/ConsultationsPage';
import RemindersPage from '@/pages/Reminders/RemindersPage';
import RecordsPage from '@/pages/Records/RecordsPage';
import SettingsPage from '@/pages/Settings/SettingsPage';

// The AI assistant (and its on-device model runtime) is only loaded when opened.
const AssistantPage = lazy(() => import('@/pages/Assistant/AssistantPage'));
const assistantFallback = (
  <div className="flex justify-center py-16" role="status" aria-label="Loading">
    <div className="spinner spinner-lg" />
  </div>
);

/**
 * While a password-reset (recovery) session is active, every route except the
 * Reset Password page redirects there, so a reset link can never open the app.
 */
function RecoveryGate({ children }: { children: ReactNode }) {
  const { recoveryMode, loading } = useAuth();
  const { pathname } = useLocation();
  if (recoveryMode && pathname !== '/reset-password') {
    // Wait until Supabase has read the tokens from the link before changing the URL.
    if (loading) return <LoadingScreen />;
    return <Navigate to="/reset-password" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <RecoveryGate>
          <Routes>
            {/* Public Landing */}
            <Route path="/" element={<LandingPage />} />

            {/* Auth Routes */}
            <Route element={<AuthLayout />}>
              <Route path="/signin" element={<SignInPage />} />
              <Route path="/signup" element={<SignUpPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            </Route>

            {/* Outside AuthLayout: a recovery/OAuth session must not be bounced to the dashboard */}
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />

            {/* Profile & Onboarding */}
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/plans" element={<PlansPage />} />

            {/* Authenticated Application */}
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/medications" element={<MedicationsPage />} />
              <Route path="/insurance" element={<InsurancePage />} />
              <Route path="/consultations" element={<ConsultationsPage />} />
              <Route path="/reminders" element={<RemindersPage />} />
              <Route path="/records" element={<RecordsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route
                path="/assistant"
                element={
                  <Suspense fallback={assistantFallback}>
                    <AssistantPage />
                  </Suspense>
                }
              />
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </RecoveryGate>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

