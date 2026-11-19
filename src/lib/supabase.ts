import { createClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL;
const rawKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = (): boolean => {
  return Boolean(rawUrl && rawKey && !rawUrl.includes('placeholder') && rawUrl.startsWith('http'));
};

/**
 * Auth parameters Supabase put in the URL when it redirected back to ZCare
 * (password-reset links, OAuth callbacks, expired/invalid links). Read once,
 * before the client below consumes and removes them from the address bar.
 */
export interface AuthRedirectInfo {
  /** "recovery" for password-reset links, "signup", "magiclink", … */
  type: string | null;
  error: string | null;
  errorCode: string | null;
  errorDescription: string | null;
}
function readAuthRedirect(): AuthRedirectInfo {
  if (typeof window === 'undefined') return { type: null, error: null, errorCode: null, errorDescription: null };
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  const get = (key: string) => hash.get(key) ?? query.get(key);
  return { type: get('type'), error: get('error'), errorCode: get('error_code'), errorDescription: get('error_description') };
}
export const initialAuthRedirect: AuthRedirectInfo = readAuthRedirect();

// Use real credentials if provided, or safe placeholder URL to prevent init crash
const supabaseUrl = isSupabaseConfigured() ? rawUrl : 'https://placeholder-drec-project.supabase.co';
const supabaseKey = isSupabaseConfigured() ? rawKey : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.fake-anon-key';

if (!isSupabaseConfigured()) {
  console.info(
    'ZCare: Supabase credentials not set or using mock mode. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env for production PostgreSQL persistence. Local offline/demo mode is active.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
