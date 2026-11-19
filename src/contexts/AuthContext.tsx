import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured, initialAuthRedirect } from '@/lib/supabase';
import type { Profile } from '@/types';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  configured: boolean;
  isDemoUser: boolean;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInAsDemo: () => void;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  updatePassword: (password: string) => Promise<{ error: Error | null }>;
  /**
   * True while the user arrived through a password-reset link and has not set a new
   * password yet. The app only allows the Reset Password page in this state.
   */
  recoveryMode: boolean;
  /** Sets the new password, ends the recovery session and signs the user out. */
  completePasswordRecovery: (password: string) => Promise<{ error: Error | null }>;
  /** Leaves recovery without changing the password (signs out the recovery session). */
  cancelPasswordRecovery: () => Promise<void>;
  /** Starts "Continue with Google" (redirects to Google, then back to /auth/callback). */
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
  /**
   * Admin role from the database (zc_my_admin_role). Only used to show/hide admin UI:
   * every admin action is authorised again by the database.
   */
  adminRole: AdminRole | null;
  /** True when an administrator has deactivated this account (database-enforced). */
  accountSuspended: boolean;
  /** True until the role/status check for the signed-in user has finished. */
  accessLoading: boolean;
}

export type AdminRole = 'super_admin' | 'admin';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Turns Supabase's technical auth messages into ones users can act on. */
function friendlyAuthError(message: string): Error {
  if (/rate limit|too many requests|over_email_send_rate_limit/i.test(message)) {
    return new Error('Too many emails have been sent in a short time. Please wait a while (up to an hour) and try again.');
  }
  return new Error(message);
}

/** Survives a page refresh during recovery (cleared when the tab closes). */
const RECOVERY_FLAG = 'zcare_password_recovery';
function readRecoveryFlag(): boolean {
  try {
    return sessionStorage.getItem(RECOVERY_FLAG) === '1';
  } catch {
    return false;
  }
}
function writeRecoveryFlag(on: boolean) {
  try {
    if (on) sessionStorage.setItem(RECOVERY_FLAG, '1');
    else sessionStorage.removeItem(RECOVERY_FLAG);
  } catch {
    /* storage blocked: recovery still works for this page load */
  }
}

const DEMO_USER: User = {
  id: 'demo-user-126',
  app_metadata: {},
  user_metadata: { full_name: 'Aarav Sharma' },
  aud: 'authenticated',
  created_at: new Date().toISOString(),
  email: 'aarav.sharma@zcare.health',
} as User;

const DEMO_PROFILE: Profile = {
  id: 'demo-profile-126',
  user_id: 'demo-user-126',
  full_name: 'Aarav Sharma',
  date_of_birth: '1990-05-15',
  gender: 'male',
  language: 'English',
  height: 175,
  weight: 70,
  profile_photo_path: null,
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: new Date().toISOString(),
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemoUser, setIsDemoUser] = useState(false);
  const configured = isSupabaseConfigured();
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [accountSuspended, setAccountSuspended] = useState(false);
  const [accessLoading, setAccessLoading] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState<boolean>(() => {
    if (!configured) return false;
    if (initialAuthRedirect.type === 'recovery' && !initialAuthRedirect.error) {
      writeRecoveryFlag(true);
      return true;
    }
    return readRecoveryFlag();
  });

  const fetchProfile = async (userId: string) => {
    // The demo account is not a Supabase user: its profile is local sample data.
    if (!configured || userId === DEMO_USER.id) {
      const stored = localStorage.getItem(`drec_profile_${userId}`);
      if (stored) {
        setProfile(JSON.parse(stored));
      } else if (userId === DEMO_USER.id) {
        setProfile(DEMO_PROFILE);
      }
      return;
    }
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching profile:', error);
      }
      setProfile(data);
    } catch (err) {
      console.error('Profile fetch failed:', err);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  useEffect(() => {
    // Check local session
    const localSession = localStorage.getItem('drec_demo_session');
    if (localSession === 'true') {
      setUser(DEMO_USER);
      setIsDemoUser(true);
      fetchProfile(DEMO_USER.id);
      setLoading(false);
      return;
    }

    if (!configured) {
      // Supabase is not configured; check if user logged in via local auth
      const localUserId = localStorage.getItem('drec_local_user_id');
      const localUserEmail = localStorage.getItem('drec_local_user_email');
      if (localUserId && localUserEmail) {
        const localUser = {
          id: localUserId,
          app_metadata: {},
          user_metadata: {},
          aud: 'authenticated',
          created_at: new Date().toISOString(),
          email: localUserEmail,
        } as User;
        setUser(localUser);
        fetchProfile(localUserId);
      }
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchProfile(s.user.id);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, s) => {
        // A reset link signs the user in with a recovery session: keep them on the reset page.
        if (event === 'PASSWORD_RECOVERY') {
          writeRecoveryFlag(true);
          setRecoveryMode(true);
        }
        if (event === 'SIGNED_OUT') {
          writeRecoveryFlag(false);
          setRecoveryMode(false);
        }
        setSession(s);
        setUser(s?.user ?? null);
        if (s?.user) {
          // Supabase warns that awaiting another Supabase call inside this callback can
          // deadlock sign-in, so the profile is loaded right after the callback returns.
          const uid = s.user.id;
          setTimeout(() => void fetchProfile(uid), 0);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, [configured]);

  // Admin role and account status for the signed-in Supabase user (not for demo/local accounts).
  const userId = user?.id ?? null;
  useEffect(() => {
    let cancelled = false;
    setAdminRole(null);
    setAccountSuspended(false);
    if (!configured || !userId || isDemoUser) {
      setAccessLoading(false);
      return;
    }
    setAccessLoading(true);
    (async () => {
      try {
        const [role, status] = await Promise.all([
          supabase.rpc('zc_my_admin_role'),
          supabase.rpc('zc_my_account_status'),
        ]);
        if (cancelled) return;
        // If the admin migration is not applied yet these calls fail: treat as a regular, active user.
        setAdminRole(role.error ? null : role.data === 'super_admin' || role.data === 'admin' ? role.data : null);
        setAccountSuspended(!status.error && status.data === 'suspended');
      } finally {
        if (!cancelled) setAccessLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, userId, isDemoUser]);

  const signInAsDemo = () => {
    // Start every demo from the full, fresh sample data set (demo edits live in this browser only).
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('drec_') && (key.endsWith(`_${DEMO_USER.id}`) || key.startsWith('drec_members_pol-'))) localStorage.removeItem(key);
      }
    } catch {
      /* storage unavailable: the demo still loads its sample data */
    }
    setUser(DEMO_USER);
    setProfile(DEMO_PROFILE);
    setIsDemoUser(true);
    localStorage.setItem('drec_demo_session', 'true');
    localStorage.setItem(`drec_profile_${DEMO_USER.id}`, JSON.stringify(DEMO_PROFILE));
  };

  const signUp = async (email: string, password: string) => {
    if (!configured) {
      // Local fallback account creation
      const newId = 'local-user-' + Date.now();
      const localUser = {
        id: newId,
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        created_at: new Date().toISOString(),
        email,
      } as User;
      localStorage.setItem('drec_local_user_id', newId);
      localStorage.setItem('drec_local_user_email', email);
      localStorage.setItem('drec_local_user_pwd_' + email, password);
      setUser(localUser);
      return { error: null };
    }
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error ? friendlyAuthError(error.message) : null };
  };

  const signIn = async (email: string, password: string) => {
    if (!configured) {
      const storedPwd = localStorage.getItem('drec_local_user_pwd_' + email);
      if (storedPwd && storedPwd === password) {
        const id = localStorage.getItem('drec_local_user_id') || 'local-user-1';
        const localUser = {
          id,
          app_metadata: {},
          user_metadata: {},
          aud: 'authenticated',
          created_at: new Date().toISOString(),
          email,
        } as User;
        setUser(localUser);
        localStorage.setItem('drec_local_user_id', id);
        localStorage.setItem('drec_local_user_email', email);
        return { error: null };
      }
      return { error: new Error('Invalid email or password in local storage. (Try "Explore Demo" or sign up)') };
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) {
      // A real sign-in replaces any leftover demo session.
      localStorage.removeItem('drec_demo_session');
      setIsDemoUser(false);
    }
    return { error: error ? new Error(error.message) : null };
  };

  const signOut = async () => {
    writeRecoveryFlag(false);
    setRecoveryMode(false);
    localStorage.removeItem('drec_demo_session');
    localStorage.removeItem('drec_local_user_id');
    localStorage.removeItem('drec_local_user_email');
    setIsDemoUser(false);
    setUser(null);
    setProfile(null);
    if (configured) {
      await supabase.auth.signOut();
    }
  };

  const resetPassword = async (email: string) => {
    if (!configured) {
      return { error: null };
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error: error ? friendlyAuthError(error.message) : null };
  };

  const updatePassword = async (password: string) => {
    if (!configured) {
      return { error: null };
    }
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error ? new Error(error.message) : null };
  };

  const completePasswordRecovery = async (password: string) => {
    if (!configured) return { error: new Error('Password reset needs the online (Supabase) version of ZCare.') };
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      return { error: new Error('Your reset link has expired or was already used. Please request a new one.') };
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { error: new Error(error.message) };
    // The recovery session must not become a normal login: end it and ask the user to sign in.
    writeRecoveryFlag(false);
    await supabase.auth.signOut();
    setRecoveryMode(false);
    setUser(null);
    setSession(null);
    setProfile(null);
    return { error: null };
  };

  const cancelPasswordRecovery = async () => {
    writeRecoveryFlag(false);
    if (configured) await supabase.auth.signOut();
    setRecoveryMode(false);
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  const signInWithGoogle = async () => {
    if (!configured) return { error: new Error('Google sign-in needs the online (Supabase) version of ZCare.') };
    // Ask Supabase (public settings endpoint) whether Google is enabled, so users see a clear
    // message in ZCare instead of Supabase's raw "provider is not enabled" error page.
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`, {
        headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
      });
      if (res.ok) {
        const settings = (await res.json()) as { external?: Record<string, boolean> };
        if (settings.external && settings.external.google !== true) {
          return { error: new Error('Google sign-in is not enabled for ZCare yet. Please use email and password for now.') };
        }
      }
    } catch {
      /* settings check is best effort; continue to Supabase */
    }
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback`, skipBrowserRedirect: true },
    });
    if (error || !data?.url) return { error: new Error(error?.message ?? 'Google sign-in could not be started.') };
    window.location.assign(data.url);
    return { error: null };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        configured,
        isDemoUser,
        signUp,
        signIn,
        signInAsDemo,
        signOut,
        resetPassword,
        updatePassword,
        refreshProfile,
        recoveryMode,
        completePasswordRecovery,
        cancelPasswordRecovery,
        signInWithGoogle,
        adminRole,
        accountSuspended,
        accessLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
