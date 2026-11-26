/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_RAZORPAY_KEY_ID?: string;
  /** Accounts created before this ISO date never see the first-time welcome modal. */
  readonly VITE_WELCOME_LAUNCH_DATE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
