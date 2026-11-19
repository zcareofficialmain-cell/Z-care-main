// ============================================================
// ZCare AI — picks the record source for the signed-in user
// ============================================================
//  * Real accounts (Supabase configured): SupabaseHealthDataSource —
//    shared Supabase client, session identity, Row Level Security.
//  * "Explore Demo" account: the app's demo seed data (no network).
//  * Offline local mode (Supabase not configured): existing api.ts
//    localStorage functions.

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import * as api from '@/services/api';
import type { HealthDataSource } from '@/types/ai.types';
import { LocalApiHealthDataSource, SupabaseHealthDataSource, type SupabaseLike } from './health-data.repository';
import { createDemoDataSource } from './demo-records';

export function createHealthDataSource(opts: { userId: string; isDemoUser: boolean }): HealthDataSource {
  if (opts.isDemoUser) return createDemoDataSource();
  if (isSupabaseConfigured()) {
    // The UI's user id is only used to detect an account switch; identity comes from the session.
    return new SupabaseHealthDataSource(supabase as unknown as SupabaseLike, opts.userId);
  }
  return new LocalApiHealthDataSource(api, opts.userId);
}
