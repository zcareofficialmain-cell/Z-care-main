import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ToastProvider } from '@/components/ui/Toast';
import { initialAuthRedirect } from '@/lib/supabase';

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
import PrivacyPolicyPage from '@/pages/Legal/PrivacyPolicyPage';
import TermsPage from '@/pages/Legal/TermsPage';
import RefundPolicyPage from '@/pages/Legal/RefundPolicyPage';
import ContactUsPage from '@/pages/Legal/ContactUsPage';
import AboutUsPage from '@/pages/Legal/AboutUsPage';

import DashboardPage from '@/pages/Dashboard/DashboardPage';
import MedicationsPage from '@/pages/Medications/MedicationsPage';
import InsurancePage from '@/pages/Insurance/InsurancePage';
import ConsultationsPage from '@/pages/Consultations/ConsultationsPage';
import RemindersPage from '@/pages/Reminders/RemindersPage';
import RecordsPage from '@/pages/Records/RecordsPage';
import SettingsPage from '@/pages/Settings/SettingsPage';

// The AI assistant (and its on-device model runtime) is only loaded when opened.
const AssistantPage = lazy(() => import('@/pages/Assistant/AssistantPage'));
// Admin dashboard: loaded only for administrators. Access is enforced by the database.
const AdminPage = lazy(() => import('@/pages/Admin/AdminPage'));
const assistantFallback = (
  <div className="flex justify-center py-16" role="status" aria-label="Loading">
    <div className="spinner spinner-lg" />
  </div>
);

/**
 * Handles special incoming auth redirects:
 * - Password recovery sessions redirect to /reset-password.
 * - Email verification signups that land on root redirect to /auth/callback for onboarding.
 */
function AuthRedirectGate({ children }: { children: ReactNode }) {
  const { recoveryMode, loading } = useAuth();
  const { pathname } = useLocation();
  if (recoveryMode && pathname !== '/reset-password') {
    // Wait until Supabase has read the tokens from the link before changing the URL.
    if (loading) return <LoadingScreen />;
    return <Navigate to="/reset-password" replace />;
  }
  if (initialAuthRedirect.type === 'signup' && pathname === '/') {
    return <Navigate to="/auth/callback" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AuthRedirectGate>
          <Routes>
            {/* Public Landing */}
            <Route path="/" element={<LandingPage />} />

            {/* Public Legal & Compliance Pages */}
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/refund-policy" element={<RefundPolicyPage />} />
            <Route path="/contact" element={<ContactUsPage />} />
            <Route path="/about" element={<AboutUsPage />} />

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
                path="/admin"
                element={
                  <Suspense fallback={assistantFallback}>
                    <AdminPage />
                  </Suspense>
                }
              />
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
          </AuthRedirectGate>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

