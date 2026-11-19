import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Shield,
  CreditCard,
  Download,
  Lock,
  LogOut,
  CheckCircle,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { upsertProfile, getMembership, getMedications, getAllergies, getConsultations, getInsurancePolicies, getMedicalDocuments, getReminders } from '@/services/api';
import { generateHealthSummaryPDF } from '@/services/pdfGenerator';
import { useToast } from '@/components/ui/Toast';
import type { ProfileFormData } from '@/types';
import { formatCurrency, planById, type MembershipState } from '@/lib/plans';

export default function SettingsPage() {
  const { user, profile, refreshProfile, signOut, updatePassword, isDemoUser, configured } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [form, setForm] = useState<ProfileFormData>({
    full_name: profile?.full_name || '',
    date_of_birth: profile?.date_of_birth || '',
    gender: profile?.gender || 'male',
    language: profile?.language || 'English',
    height: profile?.height?.toString() || '175',
    weight: profile?.weight?.toString() || '70',
  });
  const [profileSaving, setProfileSaving] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const [membership, setMembership] = useState<MembershipState | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getMembership(user.id).then(m => { if (!cancelled) setMembership(m); }).catch(() => {});
    return () => { cancelled = true; };
  }, [user]);

  const handleProfileSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setProfileSaving(true);
    try {
      await upsertProfile(user.id, form);
      await refreshProfile();
      showToast('success', 'Profile updated successfully');
    } catch (err) {
      showToast('error', 'Failed to update profile');
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      showToast('error', 'Password must be at least 6 characters');
      return;
    }
    setPasswordSaving(true);
    const { error } = await updatePassword(newPassword);
    setPasswordSaving(false);
    if (error) {
      showToast('error', error.message);
    } else {
      showToast('success', 'Password updated successfully');
      setNewPassword('');
    }
  };

  const handleDownloadSummary = async () => {
    if (!user) return;
    setDownloadingPDF(true);
    try {
      const [m, a, p, c, d, r] = await Promise.all([
        getMedications(user.id),
        getAllergies(user.id),
        getInsurancePolicies(user.id),
        getConsultations(user.id),
        getMedicalDocuments(user.id),
        getReminders(user.id),
      ]);
      generateHealthSummaryPDF(profile, m, a, c, p, d, r);
      showToast('success', 'Health summary PDF generated and downloaded');
    } catch (err) {
      showToast('error', 'Failed to generate PDF');
    } finally {
      setDownloadingPDF(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
          Account & Health Space Settings
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
          Manage your personal details, plan, security preferences, and health summary downloads.
        </p>
      </div>

      {/* Subscription Card */}
      <div className="card p-6 border-l-4 border-l-[var(--color-emerald-primary)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <CreditCard size={18} style={{ color: 'var(--color-emerald-primary)' }} />
              <h2 className="text-base font-bold">ZCare Health Plan</h2>
              {membership && (
                <span className={`badge text-xs font-semibold uppercase ${membership.hasAccess ? 'badge-success' : ''}`}
                  style={membership.hasAccess ? undefined : { backgroundColor: 'var(--color-border-light)', color: 'var(--color-text-muted)' }}>
                  {membership.current?.status === 'trial' ? 'Free trial' : membership.hasAccess ? 'Active member' : membership.pending ? 'Payment pending' : membership.lapsed ? 'Expired' : 'No plan'}
                </span>
              )}
            </div>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {!membership
                ? 'Checking your plan…'
                : membership.current
                  ? `${planById(membership.current.plan)?.name ?? membership.current.plan} plan${membership.current.amount ? ` (${formatCurrency(Number(membership.current.amount))})` : ''} — active until ${new Date(membership.current.period_end).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}.`
                  : membership.pending
                    ? `${planById(membership.pending.plan)?.name ?? membership.pending.plan} plan (${formatCurrency(Number(membership.pending.amount))}) requested — not active until payment is completed.`
                    : membership.lapsed
                      ? `Your ${planById(membership.lapsed.plan)?.name.toLowerCase() ?? 'plan'} ended on ${new Date(membership.lapsed.period_end).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}.`
                      : 'Start a 1-day free trial, or choose Monthly (₹199) or Yearly (₹1,299).'}
            </p>
          </div>

          <button
            onClick={() => navigate('/plans')}
            className="btn btn-outline btn-sm shrink-0"
          >
            {membership?.hasAccess ? 'Change Plan' : 'View Plans'}
          </button>
        </div>
      </div>

      {/* Profile Form */}
      <div className="card p-6 md:p-8">
        <div className="flex items-center gap-2 mb-6">
          <User size={18} style={{ color: 'var(--color-emerald-primary)' }} />
          <h2 className="text-base font-bold">Personal Health Profile</h2>
        </div>

        <form onSubmit={handleProfileSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="input-group">
              <label className="input-label" htmlFor="set-name">Full Name</label>
              <input
                id="set-name"
                type="text"
                required
                className="input-field"
                value={form.full_name}
                onChange={e => setForm({ ...form, full_name: e.target.value })}
              />
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="set-dob">Date of Birth</label>
              <input
                id="set-dob"
                type="date"
                className="input-field"
                value={form.date_of_birth}
                onChange={e => setForm({ ...form, date_of_birth: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="input-group">
              <label className="input-label" htmlFor="set-gender">Gender</label>
              <select
                id="set-gender"
                className="input-field"
                value={form.gender}
                onChange={e => setForm({ ...form, gender: e.target.value })}
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="prefer-not-to-say">Prefer not to say</option>
              </select>
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="set-height">Height (cm)</label>
              <input
                id="set-height"
                type="number"
                className="input-field"
                placeholder="175"
                value={form.height}
                onChange={e => setForm({ ...form, height: e.target.value })}
              />
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="set-weight">Weight (kg)</label>
              <input
                id="set-weight"
                type="number"
                className="input-field"
                placeholder="70"
                value={form.weight}
                onChange={e => setForm({ ...form, weight: e.target.value })}
              />
            </div>
          </div>

          <div className="flex justify-end pt-3">
            <button
              type="submit"
              disabled={profileSaving}
              className="btn btn-primary"
            >
              {profileSaving ? 'Saving...' : 'Update Profile'}
            </button>
          </div>
        </form>
      </div>

      {/* Export / Download Health Summary */}
      <div className="card p-6 md:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Download size={18} style={{ color: 'var(--color-emerald-primary)' }} />
              <h2 className="text-base font-bold">Download Health Summary (PDF)</h2>
            </div>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Export a clean, professional medical summary containing your active medications, allergies, consultations, and insurance details to share with clinicians.
            </p>
          </div>

          <button
            onClick={handleDownloadSummary}
            disabled={downloadingPDF}
            className="btn btn-outline flex items-center gap-2 shrink-0"
          >
            <Download size={16} />
            {downloadingPDF ? 'Generating...' : 'Export PDF'}
          </button>
        </div>
      </div>

      {/* Security & Password */}
      {configured && (
        <div className="card p-6 md:p-8">
          <div className="flex items-center gap-2 mb-4">
            <Lock size={18} style={{ color: 'var(--color-emerald-primary)' }} />
            <h2 className="text-base font-bold">Update Password</h2>
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-sm">
            <div className="input-group">
              <label className="input-label" htmlFor="set-new-pwd">New Password</label>
              <input
                id="set-new-pwd"
                type="password"
                required
                className="input-field"
                placeholder="At least 6 characters"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={passwordSaving}
              className="btn btn-outline btn-sm"
            >
              {passwordSaving ? 'Updating...' : 'Change Password'}
            </button>
          </form>
        </div>
      )}

      {/* Sign Out */}
      <div className="pt-4 flex justify-between items-center text-xs text-[var(--color-text-light)]">
        <span>Logged in as <strong>{user?.email || 'Aarav Sharma'}</strong></span>
        <button
          onClick={handleSignOut}
          className="btn btn-ghost text-red-600 flex items-center gap-1.5"
        >
          <LogOut size={16} />
          Sign Out of ZCare
        </button>
      </div>
    </div>
  );
}

