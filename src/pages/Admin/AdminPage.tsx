import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import {
  ShieldCheck, Users, CreditCard, UserCog, ScrollText, Settings2, RefreshCw, Search, Lock, Clock,
  UserX, UserCheck, ChevronLeft, ChevronRight, Activity, Hourglass, CalendarCheck, CalendarRange, AlertCircle,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import {
  adminApi, actionLabel, type AccountStatus, type AdminListRow, type AdminOverview, type AdminSubscriptionRow,
  type AdminUserDetail, type AdminUserRow, type AuditEntry, type SubscriptionFilter, type SystemInfo,
} from '@/services/admin';

const PAGE = 25;
type Tab = 'overview' | 'users' | 'memberships' | 'admins' | 'audit' | 'system';

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const planName = (p: string | null) => (p === 'trial' ? 'Free Trial' : p === 'monthly' ? 'Monthly' : p === 'yearly' ? 'Yearly' : p ?? '—');
const money = (n: number) => (Number(n) === 0 ? 'Free' : `₹${Number(n).toLocaleString('en-IN')}`);

function StatusBadge({ status }: { status: string | null }) {
  const cls: Record<string, string> = {
    active: 'badge-success', trial: 'badge-info', pending: 'badge-warning', expired: 'badge-neutral',
    cancelled: 'badge-neutral', suspended: 'badge-danger',
  };
  const label: Record<string, string> = { trial: 'Trial active', active: 'Active', pending: 'Pending', expired: 'Expired', cancelled: 'Cancelled', suspended: 'Deactivated' };
  if (!status) return <span className="badge badge-neutral">No plan</span>;
  return <span className={`badge ${cls[status] ?? 'badge-neutral'}`}>{label[status] ?? status}</span>;
}

function RoleBadge({ role }: { role: string | null }) {
  if (!role) return null;
  return <span className="badge badge-emerald">{role === 'super_admin' ? 'Super Admin' : 'Admin'}</span>;
}

function paymentState(s: { effective_status: string; plan: string; provider_reference: string | null }) {
  if (s.plan === 'trial') return 'Free trial';
  if (s.effective_status === 'pending') return 'Awaiting payment';
  if (s.provider_reference) return 'Paid (verified)';
  return '—';
}

function Pager({ offset, total, onChange }: { offset: number; total: number; onChange: (o: number) => void }) {
  if (total <= PAGE) return null;
  return (
    <div className="flex items-center justify-between gap-3 pt-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
      <span>{offset + 1}–{Math.min(offset + PAGE, total)} of {total}</span>
      <div className="flex gap-2">
        <button className="btn btn-outline btn-sm" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - PAGE))} aria-label="Previous page"><ChevronLeft size={16} /></button>
        <button className="btn btn-outline btn-sm" disabled={offset + PAGE >= total} onClick={() => onChange(offset + PAGE)} aria-label="Next page"><ChevronRight size={16} /></button>
      </div>
    </div>
  );
}

function Card({ title, icon, children, action }: { title: string; icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="card p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-base font-semibold flex items-center gap-2">{icon}{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg text-sm" role="alert" style={{ backgroundColor: 'var(--color-danger-light)', color: 'var(--color-danger)' }}>
      <AlertCircle size={16} className="shrink-0 mt-0.5" /> {message}
    </div>
  );
}

const thStyle = { color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border-light)' };
const tdStyle = { borderBottom: '1px solid var(--color-border-light)' };

// ------------------------------------------------------------------ Overview
function OverviewTab() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setError('');
    adminApi.overview().then(setData).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const stats: Array<[string, number | undefined, ReactNode]> = [
    ['Registered users', data?.total_users, <Users size={18} key="u" />],
    ['Active users (30 days)', data?.active_users_30d, <Activity size={18} key="a" />],
    ['Active free trials', data?.active_trials, <Hourglass size={18} key="t" />],
    ['Active monthly', data?.active_monthly, <CalendarCheck size={18} key="m" />],
    ['Active yearly', data?.active_yearly, <CalendarRange size={18} key="y" />],
    ['Pending requests', data?.pending_requests, <Clock size={18} key="p" />],
    ['Expired subscriptions', data?.expired, <CreditCard size={18} key="e" />],
    ['Deactivated accounts', data?.suspended_users, <UserX size={18} key="s" />],
  ];
  return (
    <div className="flex flex-col gap-5">
      {error && <ErrorNote message={error} />}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(([label, value, icon]) => (
          <div key={label} className="card p-4">
            <div className="flex items-center justify-between" style={{ color: 'var(--color-emerald-primary)' }}>
              <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
              {icon}
            </div>
            <div className="text-2xl font-bold mt-2">{value ?? '…'}</div>
          </div>
        ))}
      </div>
      <Card title="Recent administrative activity" icon={<ScrollText size={18} />} action={<button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={14} /> Refresh</button>}>
        <AuditList entries={data?.recent_activity ?? []} />
        {data && <p className="text-xs mt-3" style={{ color: 'var(--color-text-light)' }}>Updated {fmtDateTime(data.generated_at)}</p>}
      </Card>
    </div>
  );
}

function AuditList({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) return <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No administrative activity yet.</p>;
  return (
    <ul className="flex flex-col">
      {entries.map(e => (
        <li key={e.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-sm" style={tdStyle}>
          <span>
            <strong>{actionLabel(e.action)}</strong>
            {e.target_email ? <> · {e.target_email}</> : null}
            {typeof e.metadata?.reason === 'string' && e.metadata.reason ? <span style={{ color: 'var(--color-text-muted)' }}> — “{e.metadata.reason}”</span> : null}
            {typeof e.metadata?.rows === 'number' ? <span style={{ color: 'var(--color-text-muted)' }}> — {e.metadata.rows} record(s)</span> : null}
          </span>
          <span className="text-xs shrink-0" style={{ color: 'var(--color-text-muted)' }}>
            {e.actor_email ?? 'System (SQL procedure)'} · {fmtDateTime(e.created_at)}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ Users
function UsersTab({ isSuper, myId }: { isSuper: boolean; myId: string | undefined }) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<AdminUserRow[] | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => { setQuery(search.trim()); setOffset(0); }, 300);
    return () => window.clearTimeout(t);
  }, [search]);
  const load = useCallback(() => {
    setError('');
    adminApi.listUsers(query, status, PAGE, offset).then(setRows).catch((e: Error) => setError(e.message));
  }, [query, status, offset]);
  useEffect(load, [load]);
  const total = rows?.[0]?.total_count ?? 0;

  return (
    <Card title="Users" icon={<Users size={18} />}>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-light)' }} />
          <input className="input-field" style={{ paddingLeft: 36 }} placeholder="Search by name or email" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search users" />
        </div>
        <select className="input-field sm:w-48" value={status ?? ''} onChange={e => { setStatus((e.target.value || null) as AccountStatus | null); setOffset(0); }} aria-label="Account status">
          <option value="">All accounts</option>
          <option value="active">Active</option>
          <option value="suspended">Deactivated</option>
        </select>
      </div>
      {error && <ErrorNote message={error} />}
      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full text-sm" style={{ minWidth: 720 }}>
          <thead>
            <tr className="text-left text-xs">
              {['User', 'Registered', 'Last sign-in', 'Account', 'Membership', ''].map(h => <th key={h} className="py-2 pr-3 font-medium" style={thStyle}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows?.map(u => (
              <tr key={u.user_id}>
                <td className="py-2.5 pr-3" style={tdStyle}>
                  <div className="font-medium flex items-center gap-2 flex-wrap">{u.full_name || '—'} <RoleBadge role={u.admin_role} /></div>
                  <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{u.email}{!u.email_confirmed && ' · email not confirmed'}</div>
                </td>
                <td className="py-2.5 pr-3" style={tdStyle}>{fmtDate(u.created_at)}</td>
                <td className="py-2.5 pr-3" style={tdStyle}>{fmtDate(u.last_sign_in_at)}</td>
                <td className="py-2.5 pr-3" style={tdStyle}><StatusBadge status={u.account_status === 'suspended' ? 'suspended' : 'active'} /></td>
                <td className="py-2.5 pr-3" style={tdStyle}>
                  <div className="flex items-center gap-2 flex-wrap">{u.membership_plan ? planName(u.membership_plan) : ''} <StatusBadge status={u.membership_status} /></div>
                  {u.membership_end && <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>until {fmtDate(u.membership_end)}</div>}
                </td>
                <td className="py-2.5 text-right" style={tdStyle}><button className="btn btn-outline btn-sm" onClick={() => setSelected(u.user_id)}>Manage</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows && rows.length === 0 && <p className="text-sm py-6 text-center" style={{ color: 'var(--color-text-muted)' }}>No users match.</p>}
        {!rows && !error && <div className="flex justify-center py-8"><span className="spinner" /></div>}
      </div>
      <Pager offset={offset} total={total} onChange={setOffset} />
      {selected && <UserDetailModal userId={selected} isSuper={isSuper} myId={myId} onClose={() => setSelected(null)} onChanged={load} />}
    </Card>
  );
}

function UserDetailModal({ userId, isSuper, myId, onClose, onChanged }: { userId: string; isSuper: boolean; myId: string | undefined; onClose: () => void; onChanged: () => void }) {
  const { showToast } = useToast();
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState<AccountStatus | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    adminApi.getUser(userId).then(setDetail).catch((e: Error) => setError(e.message));
  }, [userId]);
  useEffect(load, [load]);

  const canChange = !!detail && detail.user_id !== myId && detail.admin_role !== 'super_admin' && (detail.admin_role !== 'admin' || isSuper);
  const apply = async () => {
    if (!confirm) return;
    setSaving(true);
    try {
      await adminApi.setAccountStatus(userId, confirm, confirm === 'suspended' ? reason.trim() : reason.trim() || null);
      showToast('success', confirm === 'suspended' ? 'Account deactivated.' : 'Account reactivated.');
      setReason('');
      load();
      onChanged();
    } catch (e) {
      showToast('error', (e as Error).message);
    } finally {
      setSaving(false);
      setConfirm(null);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Account details" size="lg">
      {error && <ErrorNote message={error} />}
      {!detail && !error && <div className="flex justify-center py-8"><span className="spinner" /></div>}
      {detail && (
        <div className="flex flex-col gap-5 text-sm">
          <div className="flex items-start gap-2 p-3 rounded-lg text-xs" style={{ backgroundColor: 'var(--color-mint-lighter)', color: 'var(--color-teal-deep)' }}>
            <Lock size={14} className="shrink-0 mt-0.5" /> Medical records are private to the account holder and are not shown to administrators. Opening this page is recorded in the audit log.
          </div>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
            {([
              ['Name', detail.full_name || '—'], ['Email', detail.email || '—'],
              ['Registered', fmtDateTime(detail.created_at)], ['Last sign-in', fmtDateTime(detail.last_sign_in_at)],
              ['Email confirmed', detail.email_confirmed ? 'Yes' : 'No'], ['Sign-in methods', detail.providers.join(', ') || '—'],
              ['Language', detail.language || '—'], ['Role', detail.admin_role === 'super_admin' ? 'Super Admin' : detail.admin_role === 'admin' ? 'Admin' : 'User'],
            ] as const).map(([k, v]) => (
              <div key={k}><div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{k}</div><div className="font-medium break-words">{v}</div></div>
            ))}
          </div>

          <div>
            <h3 className="font-semibold mb-2">Membership history</h3>
            {detail.subscriptions.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No memberships yet.</p> : (
              <ul className="flex flex-col">
                {detail.subscriptions.map(s => (
                  <li key={s.id} className="py-2 flex flex-wrap items-center justify-between gap-2" style={tdStyle}>
                    <span className="flex items-center gap-2">{planName(s.plan)} · {money(s.amount)} <StatusBadge status={s.effective_status} /></span>
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{fmtDate(s.period_start)} → {fmtDate(s.period_end)}{s.provider_reference ? ` · ref ${s.provider_reference}` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card p-4" style={{ borderColor: detail.account_status === 'suspended' ? 'var(--color-danger)' : undefined }}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="font-semibold">Account status</h3>
              <StatusBadge status={detail.account_status === 'suspended' ? 'suspended' : 'active'} />
            </div>
            {detail.account_status === 'suspended' && (
              <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>Deactivated {fmtDateTime(detail.status_changed_at)}{detail.status_reason ? ` — “${detail.status_reason}”` : ''}</p>
            )}
            {!canChange ? (
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {detail.user_id === myId ? 'You cannot change your own account status.' : detail.admin_role === 'super_admin' ? 'The Super Admin account cannot be deactivated.' : 'Only the Super Admin can change another administrator.'}
              </p>
            ) : detail.account_status === 'active' ? (
              <>
                <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>Deactivating blocks access to all of this user’s data in ZCare. Their records are kept and nothing is deleted.</p>
                <textarea className="input-field mb-2" rows={2} maxLength={500} placeholder="Reason (required)" value={reason} onChange={e => setReason(e.target.value)} aria-label="Reason for deactivation" />
                <button className="btn btn-danger btn-sm" disabled={!reason.trim() || saving} onClick={() => setConfirm('suspended')}><UserX size={14} /> Deactivate account</button>
              </>
            ) : (
              <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => setConfirm('active')}><UserCheck size={14} /> Reactivate account</button>
            )}
          </div>
        </div>
      )}
      <ConfirmDialog
        isOpen={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={apply}
        loading={saving}
        variant={confirm === 'suspended' ? 'danger' : 'warning'}
        title={confirm === 'suspended' ? 'Deactivate this account?' : 'Reactivate this account?'}
        message={confirm === 'suspended' ? `${detail?.email ?? 'This user'} will lose access to ZCare until reactivated. This is recorded in the audit log.` : `${detail?.email ?? 'This user'} will regain access to ZCare. This is recorded in the audit log.`}
        confirmLabel={confirm === 'suspended' ? 'Deactivate' : 'Reactivate'}
      />
    </Modal>
  );
}

// ------------------------------------------------------------------ Memberships
const FILTERS: Array<[SubscriptionFilter, string]> = [
  ['all', 'All'], ['active', 'Active'], ['pending', 'Pending'], ['expired', 'Expired'], ['trial', 'Trial'], ['monthly', 'Monthly'], ['yearly', 'Yearly'],
];
function MembershipsTab() {
  const [filter, setFilter] = useState<SubscriptionFilter>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<AdminSubscriptionRow[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => { setQuery(search.trim()); setOffset(0); }, 300);
    return () => window.clearTimeout(t);
  }, [search]);
  useEffect(() => {
    setError('');
    setRows(null);
    adminApi.listSubscriptions(filter, query, PAGE, offset).then(setRows).catch((e: Error) => setError(e.message));
  }, [filter, query, offset]);
  const total = rows?.[0]?.total_count ?? 0;

  return (
    <Card title="Memberships" icon={<CreditCard size={18} />}>
      <div className="flex items-start gap-2 p-3 rounded-lg text-xs mb-4" style={{ backgroundColor: 'var(--color-info-light)', color: 'var(--color-info)' }}>
        <Lock size={14} className="shrink-0 mt-0.5" />
        Paid plans become active only after a verified payment on the server. Pending requests cannot be activated from this dashboard.
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {FILTERS.map(([key, label]) => (
          <button key={key} className={`btn btn-sm ${filter === key ? 'btn-primary' : 'btn-outline'}`} onClick={() => { setFilter(key); setOffset(0); }}>{label}</button>
        ))}
      </div>
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-light)' }} />
        <input className="input-field" style={{ paddingLeft: 36 }} placeholder="Search by email or payment reference" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search memberships" />
      </div>
      {error && <ErrorNote message={error} />}
      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full text-sm" style={{ minWidth: 760 }}>
          <thead>
            <tr className="text-left text-xs">
              {['User', 'Plan', 'Status', 'Amount', 'Period', 'Payment'].map(h => <th key={h} className="py-2 pr-3 font-medium" style={thStyle}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows?.map(s => (
              <tr key={s.id}>
                <td className="py-2.5 pr-3" style={tdStyle}>{s.email ?? '—'}<div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>requested {fmtDate(s.created_at)}</div></td>
                <td className="py-2.5 pr-3" style={tdStyle}>{planName(s.plan)}</td>
                <td className="py-2.5 pr-3" style={tdStyle}><StatusBadge status={s.effective_status} /></td>
                <td className="py-2.5 pr-3" style={tdStyle}>{money(s.amount)}</td>
                <td className="py-2.5 pr-3" style={tdStyle}>{s.effective_status === 'pending' ? '—' : `${fmtDate(s.period_start)} → ${fmtDate(s.period_end)}`}</td>
                <td className="py-2.5 pr-3" style={tdStyle}>{paymentState(s)}{s.provider_reference && <div className="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>{s.provider_reference}</div>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows && rows.length === 0 && <p className="text-sm py-6 text-center" style={{ color: 'var(--color-text-muted)' }}>No subscriptions match.</p>}
        {!rows && !error && <div className="flex justify-center py-8"><span className="spinner" /></div>}
      </div>
      <Pager offset={offset} total={total} onChange={setOffset} />
    </Card>
  );
}

// ------------------------------------------------------------------ Admins
function AdminsTab({ isSuper }: { isSuper: boolean }) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<AdminListRow[] | null>(null);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [revoke, setRevoke] = useState<AdminListRow | null>(null);
  const load = useCallback(() => {
    adminApi.listAdmins().then(setRows).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const grant = async () => {
    setBusy(true);
    try {
      await adminApi.grantAdmin(email.trim());
      showToast('success', `${email.trim()} is now an Admin.`);
      setEmail('');
      load();
    } catch (e) {
      showToast('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const doRevoke = async () => {
    if (!revoke) return;
    setBusy(true);
    try {
      await adminApi.revokeAdmin(revoke.user_id);
      showToast('success', 'Admin access removed.');
      load();
    } catch (e) {
      showToast('error', (e as Error).message);
    } finally {
      setBusy(false);
      setRevoke(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <Card title="Administrators" icon={<UserCog size={18} />}>
        {error && <ErrorNote message={error} />}
        <ul className="flex flex-col">
          {rows?.map(a => (
            <li key={a.user_id} className="py-3 flex flex-wrap items-center justify-between gap-2 text-sm" style={tdStyle}>
              <span className="flex items-center gap-2 flex-wrap"><strong>{a.email}</strong> <RoleBadge role={a.role} /></span>
              <span className="flex items-center gap-3">
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>since {fmtDate(a.granted_at)}{a.granted_by_email ? ` · by ${a.granted_by_email}` : ''}</span>
                {isSuper && a.role === 'admin' && <button className="btn btn-outline btn-sm" onClick={() => setRevoke(a)}>Revoke</button>}
              </span>
            </li>
          ))}
        </ul>
      </Card>
      {isSuper ? (
        <Card title="Grant Admin access" icon={<ShieldCheck size={18} />}>
          <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
            The person must already have a ZCare account. Admins can view users and memberships and deactivate regular accounts; they cannot see medical records, manage admins or change system settings.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <input className="input-field flex-1" type="email" placeholder="name@example.com" value={email} onChange={e => setEmail(e.target.value)} aria-label="Email of the new admin" />
            <button className="btn btn-primary" disabled={busy || !/^\S+@\S+\.\S+$/.test(email.trim())} onClick={grant}>Grant Admin</button>
          </div>
          <p className="text-xs mt-3" style={{ color: 'var(--color-text-light)' }}>The Super Admin role itself can only be moved by the documented SQL procedure (docs/ADMIN_GUIDE.md).</p>
        </Card>
      ) : (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Only the Super Admin can grant or revoke administrator access.</p>
      )}
      <ConfirmDialog
        isOpen={revoke !== null}
        onClose={() => setRevoke(null)}
        onConfirm={doRevoke}
        loading={busy}
        title="Revoke admin access?"
        message={`${revoke?.email ?? ''} will lose access to the Admin Dashboard. Their regular ZCare account is not affected.`}
        confirmLabel="Revoke"
      />
    </div>
  );
}

// ------------------------------------------------------------------ Audit
function AuditTab() {
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setRows(null);
    adminApi.auditLog(PAGE, offset).then(setRows).catch((e: Error) => setError(e.message));
  }, [offset]);
  const total = (rows?.[0] as (AuditEntry & { total_count?: number }) | undefined)?.total_count ?? 0;
  return (
    <Card title="Audit log" icon={<ScrollText size={18} />}>
      <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>Every administrative action is recorded permanently. Entries cannot be edited or deleted.</p>
      {error && <ErrorNote message={error} />}
      {rows ? <AuditList entries={rows} /> : !error && <div className="flex justify-center py-8"><span className="spinner" /></div>}
      <Pager offset={offset} total={total} onChange={setOffset} />
    </Card>
  );
}

// ------------------------------------------------------------------ System
function SystemTab({ isSuper }: { isSuper: boolean }) {
  const { showToast } = useToast();
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    adminApi.systemInfo().then(setInfo).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  const run = async () => {
    setBusy(true);
    try {
      const n = await adminApi.expireLapsed();
      showToast('success', `${n} subscription(s) marked as expired.`);
      load();
    } catch (e) {
      showToast('error', (e as Error).message);
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };
  return (
    <div className="flex flex-col gap-5">
      {error && <ErrorNote message={error} />}
      <Card title="Membership plans" icon={<CreditCard size={18} />}>
        <div className="grid sm:grid-cols-3 gap-3">
          {info?.plans.map(p => (
            <div key={p.plan} className="card p-4">
              <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{planName(p.plan)}</div>
              <div className="text-xl font-bold mt-1">{money(p.amount)}</div>
              <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{p.duration === '24:00:00' ? '24 hours, once per account' : p.duration.replace('mon', 'month')}</div>
            </div>
          ))}
        </div>
        <p className="text-xs mt-3" style={{ color: 'var(--color-text-light)' }}>Prices and durations are fixed in the database and changed only through a reviewed migration.</p>
      </Card>
      <Card title="Subscription housekeeping" icon={<Settings2 size={18} />}>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {info ? `${info.lapsed_not_marked} subscription(s) have ended but are not yet marked "expired". Access already stopped at their end time; this only tidies their status.` : '…'}
          {info?.last_housekeeping && ` Last run ${fmtDateTime(info.last_housekeeping)}.`}
        </p>
        {isSuper ? (
          <button className="btn btn-outline btn-sm mt-3" disabled={busy || !info || info.lapsed_not_marked === 0} onClick={() => setConfirm(true)}>Mark lapsed subscriptions as expired</button>
        ) : (
          <p className="text-xs mt-3" style={{ color: 'var(--color-text-muted)' }}>Only the Super Admin can run housekeeping.</p>
        )}
      </Card>
      <ConfirmDialog isOpen={confirm} onClose={() => setConfirm(false)} onConfirm={run} loading={busy} variant="warning" title="Mark lapsed subscriptions as expired?" message="Only subscriptions whose end time has already passed are changed. This is recorded in the audit log." confirmLabel="Run" />
    </div>
  );
}

// ------------------------------------------------------------------ Page
export default function AdminPage() {
  const { adminRole, accessLoading, user, loading } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');

  if (loading || accessLoading) return <div className="flex justify-center py-16"><span className="spinner spinner-lg" /></div>;
  // UI guard only — every admin function is authorised again in the database.
  if (!adminRole) return <Navigate to="/dashboard" replace />;
  const isSuper = adminRole === 'super_admin';

  const tabs: Array<[Tab, string, ReactNode]> = [
    ['overview', 'Overview', <Activity size={16} key="o" />],
    ['users', 'Users', <Users size={16} key="u" />],
    ['memberships', 'Memberships', <CreditCard size={16} key="m" />],
    ['admins', 'Admins', <UserCog size={16} key="a" />],
    ['audit', 'Audit log', <ScrollText size={16} key="l" />],
    ['system', 'System', <Settings2 size={16} key="s" />],
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldCheck size={24} style={{ color: 'var(--color-emerald-primary)' }} /> Admin Dashboard</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>Signed in as {user?.email} · <RoleBadge role={adminRole} /></p>
        </div>
        <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}><Lock size={13} /> Patient medical records are not visible here.</p>
      </div>
      <div className="flex gap-1 overflow-x-auto mb-6 pb-1" role="tablist">
        {tabs.map(([key, label, icon]) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`nav-link shrink-0 ${tab === key ? 'active' : ''}`}>
            {icon}{label}
          </button>
        ))}
      </div>
      {tab === 'overview' && <OverviewTab />}
      {tab === 'users' && <UsersTab isSuper={isSuper} myId={user?.id} />}
      {tab === 'memberships' && <MembershipsTab />}
      {tab === 'admins' && <AdminsTab isSuper={isSuper} />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'system' && <SystemTab isSuper={isSuper} />}
    </div>
  );
}
