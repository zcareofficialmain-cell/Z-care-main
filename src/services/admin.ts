// ============================================================
// ZCare Admin — calls to the admin database functions
// ============================================================
// Every function here is authorised by the DATABASE (migration
// 20261120000000_admin_rbac.sql): the caller's role comes from auth.uid().
// Hiding the UI is a convenience only. No medical records are ever returned.

import { supabase } from '@/lib/supabase';

export type AccountStatus = 'active' | 'suspended';
export type SubscriptionFilter = 'all' | 'trial' | 'monthly' | 'yearly' | 'active' | 'pending' | 'expired';

export interface AuditEntry {
  id: number;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_email?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AdminOverview {
  total_users: number;
  active_users_30d: number;
  suspended_users: number;
  active_trials: number;
  active_monthly: number;
  active_yearly: number;
  pending_requests: number;
  expired: number;
  admins: number;
  recent_activity: AuditEntry[];
  generated_at: string;
}

export interface AdminUserRow {
  user_id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
  account_status: AccountStatus;
  admin_role: 'super_admin' | 'admin' | null;
  membership_plan: string | null;
  membership_status: string | null;
  membership_end: string | null;
  total_count: number;
}

export interface AdminSubscriptionRow {
  id: string;
  user_id: string;
  email: string | null;
  plan: string;
  status: string;
  effective_status: string;
  amount: number;
  currency: string;
  provider_reference: string | null;
  period_start: string;
  period_end: string;
  created_at: string;
  total_count: number;
}

export interface AdminUserDetail {
  user_id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
  providers: string[];
  full_name: string | null;
  language: string | null;
  profile_created_at: string | null;
  account_status: AccountStatus;
  status_reason: string | null;
  status_changed_at: string | null;
  admin_role: 'super_admin' | 'admin' | null;
  subscriptions: Array<Omit<AdminSubscriptionRow, 'user_id' | 'email' | 'total_count'>>;
}

export interface AdminListRow {
  user_id: string;
  email: string;
  role: 'super_admin' | 'admin';
  granted_at: string;
  granted_by_email: string | null;
}

export interface SystemInfo {
  plans: Array<{ plan: string; amount: number; duration: string }>;
  lapsed_not_marked: number;
  last_housekeeping: string | null;
}

const MESSAGES: Record<string, string> = {
  admin_required: 'You need administrator access for this.',
  super_admin_required: 'Only the Super Admin can do this.',
  not_authenticated: 'Please sign in again.',
  user_not_found: 'No account was found for that user or email.',
  already_admin: 'That account is already an administrator.',
  account_suspended: 'That account is deactivated. Reactivate it first.',
  not_an_admin: 'That account is not an administrator.',
  cannot_change_super_admin: 'The Super Admin cannot be changed from the dashboard.',
  cannot_change_own_status: 'You cannot deactivate your own account.',
  reason_required: 'Please enter a reason for deactivating this account.',
  reason_too_long: 'The reason must be 500 characters or fewer.',
  invalid_filter: 'That filter is not available.',
  invalid_status: 'Invalid account status.',
};

function adminError(err: { message?: string } | null): Error {
  const msg = err?.message ?? '';
  const key = Object.keys(MESSAGES).find(k => msg.includes(k));
  if (key) return new Error(MESSAGES[key]);
  if (/permission denied|JWT/i.test(msg)) return new Error(MESSAGES.admin_required);
  if (/Could not find the function|PGRST202/i.test(msg)) return new Error('The admin database update has not been applied yet.');
  return new Error('Something went wrong. Please try again.');
}

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw adminError(error);
  return data as T;
}

export const adminApi = {
  overview: () => call<AdminOverview>('admin_overview'),
  listUsers: (search: string, status: AccountStatus | null, limit: number, offset: number) =>
    call<AdminUserRow[]>('admin_list_users', { p_search: search || null, p_status: status, p_limit: limit, p_offset: offset }),
  getUser: (userId: string) => call<AdminUserDetail>('admin_get_user', { p_user_id: userId }),
  setAccountStatus: (userId: string, status: AccountStatus, reason: string | null) =>
    call<string>('admin_set_account_status', { p_user_id: userId, p_status: status, p_reason: reason }),
  listSubscriptions: (filter: SubscriptionFilter, search: string, limit: number, offset: number) =>
    call<AdminSubscriptionRow[]>('admin_list_subscriptions', { p_filter: filter, p_search: search || null, p_limit: limit, p_offset: offset }),
  listAdmins: () => call<AdminListRow[]>('admin_list_admins'),
  grantAdmin: (email: string) => call<string>('admin_grant_admin', { p_email: email }),
  revokeAdmin: (userId: string) => call<null>('admin_revoke_admin', { p_user_id: userId }),
  auditLog: (limit: number, offset: number) => call<AuditEntry[]>('admin_audit_log', { p_limit: limit, p_offset: offset }),
  systemInfo: () => call<SystemInfo>('admin_system_info'),
  expireLapsed: () => call<number>('admin_expire_lapsed_subscriptions'),
};

const ACTION_LABELS: Record<string, string> = {
  'user.viewed': 'Viewed account details',
  'user.deactivated': 'Deactivated account',
  'user.reactivated': 'Reactivated account',
  'role.granted': 'Granted admin role',
  'role.revoked': 'Revoked admin role',
  'role.super_admin_bootstrapped': 'Super Admin assigned (setup)',
  'role.super_admin_transferred': 'Super Admin transferred',
  'system.expire_lapsed': 'Marked lapsed subscriptions expired',
};
export const actionLabel = (action: string) => ACTION_LABELS[action] ?? action;
