// ============================================================
// ZCare — First-time Welcome Modal state
// ============================================================
// Source of truth: the signed-in user's Supabase Auth metadata (`zc_welcome`).
// A per-user browser key is only a fallback for offline/local accounts and for
// a save that has not reached Supabase yet. A value in Supabase always wins.
// No medical data is stored here: only 'dismissed' or 'started'.

import type { User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export type WelcomeState = 'dismissed' | 'started';

const METADATA_KEY = 'zc_welcome';
const localKey = (userId: string) => `zcare_welcome_${userId}`;

/** Accounts created before this moment never see the modal automatically. */
const DEFAULT_LAUNCH = '2026-11-25T00:00:00+05:30';

/** Launch date in ms, or null when the configured value is not a valid date (then nobody is eligible). */
export function welcomeLaunchTime(): number | null {
  const raw = (import.meta.env.VITE_WELCOME_LAUNCH_DATE as string | undefined)?.trim() || DEFAULT_LAUNCH;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

const isState = (v: unknown): v is WelcomeState => v === 'dismissed' || v === 'started';

/** Browser record: the choice, and whether Supabase has confirmed saving it. */
interface LocalRecord { s: WelcomeState; synced: boolean }

function readLocal(userId: string): LocalRecord | null {
  try {
    const raw = localStorage.getItem(localKey(userId));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<LocalRecord>;
    return isState(v.s) ? { s: v.s, synced: v.synced === true } : null;
  } catch {
    return null;
  }
}

function writeLocal(userId: string, rec: LocalRecord | null) {
  try {
    if (rec) localStorage.setItem(localKey(userId), JSON.stringify(rec));
    else localStorage.removeItem(localKey(userId));
  } catch {
    /* storage blocked: Supabase metadata still records it */
  }
}

/**
 * The welcome state for this user.
 * - Supabase metadata set: that value wins, and any browser key is removed.
 * - Metadata not set (offline/local account, a failed save, or a session issued before
 *   the save): the browser key.
 */
export function getWelcomeState(user: User): WelcomeState | null {
  const remote = user.user_metadata?.[METADATA_KEY];
  if (isState(remote)) {
    if (readLocal(user.id) !== null) writeLocal(user.id, null);
    return remote;
  }
  return readLocal(user.id)?.s ?? null;
}

/**
 * Saves `zc_welcome` in Supabase Auth user metadata through the standard Auth endpoint
 * (PUT /auth/v1/user, the same call supabase.auth.updateUser makes). It is called directly
 * so it does not emit USER_UPDATED: ZCare's AuthContext reloads the whole app on that
 * event, which would interrupt the workflow the user just opened. The current session
 * picks the value up at its next refresh or sign-in; until then the browser key covers it.
 */
async function saveRemote(state: WelcomeState): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return false;
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/user`, {
    method: 'PUT',
    headers: {
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data: { [METADATA_KEY]: state } }),
  });
  return res.ok;
}

/**
 * Records the choice. The browser key is written first, so a refresh during the save
 * cannot bring the modal back. Never throws: a failed save is retried on the next visit.
 */
export async function saveWelcomeState(user: User, state: WelcomeState): Promise<void> {
  writeLocal(user.id, { s: state, synced: false });
  if (!isSupabaseConfigured()) return; // offline/local account: the browser key is the record
  try {
    if (await saveRemote(state)) writeLocal(user.id, { s: state, synced: true });
  } catch {
    /* network failure: kept in the browser until the retry */
  }
}

/** Re-sends a choice that has not reached Supabase yet. */
export function retryPendingWelcomeState(user: User): void {
  if (!isSupabaseConfigured() || isState(user.user_metadata?.[METADATA_KEY])) return;
  const pending = readLocal(user.id);
  if (pending && !pending.synced) void saveWelcomeState(user, pending.s);
}

export interface WelcomeEligibility {
  user: User | null;
  isDemoUser: boolean;
  adminRole: string | null;
  accessLoading: boolean;
  /** Dashboard data has loaded successfully. */
  dataLoaded: boolean;
  hasHealthData: boolean;
}

/** True only for a new, regular patient account with no records that has not seen the modal. */
export function shouldShowWelcome(e: WelcomeEligibility): boolean {
  if (!e.user || e.isDemoUser || e.accessLoading || e.adminRole !== null) return false;
  if (!e.dataLoaded || e.hasHealthData) return false;
  const launch = welcomeLaunchTime();
  const created = Date.parse(e.user.created_at);
  if (launch === null || !Number.isFinite(created) || created < launch) return false;
  return getWelcomeState(e.user) === null;
}
