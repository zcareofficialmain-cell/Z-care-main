import { useEffect, useState } from 'react';
import {
  Shield,
  CheckCircle,
  Eye,
  EyeOff,
  Phone,
  Plus,
  Edit2,
  Trash2,
  Users,
  Check,
  FileText,
  AlertCircle,
  Clock,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  getInsurancePolicies,
  createInsurancePolicy,
  updateInsurancePolicy,
  deleteInsurancePolicy,
  getInsuranceMembers,
  addInsuranceMember,
  removeInsuranceMember,
} from '@/services/api';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import type {
  InsurancePolicy,
  InsurancePolicyFormData,
  InsuranceMember,
} from '@/types';
import { formatDate } from '@/utils';

export default function InsurancePage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [policies, setPolicies] = useState<InsurancePolicy[]>([]);
  const [activePolicy, setActivePolicy] = useState<InsurancePolicy | null>(null);
  const [members, setMembers] = useState<InsuranceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [maskPolicyNumber, setMaskPolicyNumber] = useState(true);

  // Policy Modal
  const [policyModalOpen, setPolicyModalOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<InsurancePolicy | null>(null);
  const [policyForm, setPolicyForm] = useState<InsurancePolicyFormData>({
    provider: 'Star Health Insurance',
    policy_number: 'SH-8849204821',
    plan_name: 'Family Health Optima',
    sum_insured: '1000000',
    valid_from: '2025-04-01',
    valid_until: '2026-03-31',
    premium: '10450',
    support_contact: '1800 425 2255',
    notes: 'Cashless hospitalisation across 14,000+ network hospitals.',
  });

  // Member Modal
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [memberName, setMemberName] = useState('');
  const [memberRel, setMemberRel] = useState('Spouse');

  // Confirm Dialog
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const pols = await getInsurancePolicies(user.id);
      setPolicies(pols);
      if (pols.length > 0) {
        setActivePolicy(pols[0]);
        const mems = await getInsuranceMembers(user.id, pols[0].id);
        setMembers(mems);
      } else {
        setActivePolicy(null);
        setMembers([]);
      }
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to load insurance coverage');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const handlePolicySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !policyForm.provider.trim() || !policyForm.policy_number.trim()) return;

    try {
      if (editingPolicy) {
        await updateInsurancePolicy(user.id, editingPolicy.id, policyForm);
        showToast('success', 'Policy updated successfully');
      } else {
        const created = await createInsurancePolicy(user.id, policyForm);
        // Add default members if new
        await addInsuranceMember(user.id, created.id, user.user_metadata?.full_name || 'Policy Holder', 'Policy holder');
        showToast('success', 'Policy created successfully');
      }
      setPolicyModalOpen(false);
      setEditingPolicy(null);
      loadData();
    } catch (err) {
      showToast('error', 'Failed to save insurance policy');
    }
  };

  const openPolicyModal = (pol?: InsurancePolicy) => {
    if (pol) {
      setEditingPolicy(pol);
      setPolicyForm({
        provider: pol.provider,
        policy_number: pol.policy_number,
        plan_name: pol.plan_name || '',
        sum_insured: pol.sum_insured?.toString() || '',
        valid_from: pol.valid_from || '',
        valid_until: pol.valid_until || '',
        premium: pol.premium?.toString() || '',
        support_contact: pol.support_contact || '',
        notes: pol.notes || '',
      });
    } else {
      setEditingPolicy(null);
      setPolicyForm({
        provider: '',
        policy_number: '',
        plan_name: '',
        sum_insured: '',
        valid_from: '',
        valid_until: '',
        premium: '',
        support_contact: '1800 425 2255',
        notes: '',
      });
    }
    setPolicyModalOpen(true);
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activePolicy || !memberName.trim()) return;

    try {
      await addInsuranceMember(user.id, activePolicy.id, memberName, memberRel);
      showToast('success', 'Insured member added');
      setMemberModalOpen(false);
      setMemberName('');
      const updated = await getInsuranceMembers(user.id, activePolicy.id);
      setMembers(updated);
    } catch (err) {
      showToast('error', 'Failed to add member');
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!activePolicy) return;
    try {
      await removeInsuranceMember(activePolicy.id, memberId);
      showToast('success', 'Member removed');
      const updated = await getInsuranceMembers(user!.id, activePolicy.id);
      setMembers(updated);
    } catch (err) {
      showToast('error', 'Failed to remove member');
    }
  };

  const handleDeletePolicy = async () => {
    if (!user || !activePolicy) return;
    try {
      await deleteInsurancePolicy(user.id, activePolicy.id);
      showToast('success', 'Policy removed');
      setConfirmDeleteOpen(false);
      loadData();
    } catch (err) {
      showToast('error', 'Failed to delete policy');
    }
  };

  const formatMasked = (num: string) => {
    if (!maskPolicyNumber) return num;
    if (num.length <= 6) return '****';
    const prefix = num.slice(0, 3);
    const suffix = num.slice(-4);
    return `${prefix} - **** ${suffix}`;
  };

  const sumInsured = activePolicy?.sum_insured || 1000000;
  const coverageAvailable = sumInsured * 0.975; // e.g. 9,75,000 as shown in reference

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Screen 6 Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--color-emerald-primary)' }}>
            YOUR COVERAGE
          </span>
          <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
            Health insurance
          </h1>
          <p className="text-sm md:text-base mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Review your policy, coverage, and support information in one secure place.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{ backgroundColor: 'var(--color-mint-soft)', color: 'var(--color-emerald-primary)' }}
          >
            <CheckCircle size={14} />
            Policy active
          </div>
          <button
            onClick={() => openPolicyModal()}
            className="btn btn-outline btn-sm flex items-center gap-1"
          >
            <Plus size={14} /> Add Policy
          </button>
        </div>
      </div>

      {!activePolicy && !loading ? (
        <div className="card p-12 text-center max-w-xl mx-auto border-dashed border-[var(--color-border)]">
          <Shield size={48} className="mx-auto mb-3 opacity-30" />
          <h2 className="text-xl font-bold mb-2">No health insurance recorded</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
            Keep your policy number, covered members, sum insured, and emergency contacts accessible whenever needed.
          </p>
          <button onClick={() => openPolicyModal()} className="btn btn-primary">
            <Plus size={16} /> Add Health Insurance Policy
          </button>
        </div>
      ) : activePolicy && (
        <div className="space-y-8">
          {/* Main Top Grid: Policy Card on Left + Members & Support on Right */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* ============================================================ */}
            {/* The Big Emerald Insurance Card matching reference design    */}
            {/* ============================================================ */}
            <div
              className="lg:col-span-7 rounded-2xl p-6 md:p-8 text-white relative shadow-lg overflow-hidden flex flex-col justify-between"
              style={{
                background: 'linear-gradient(135deg, #005F4B 0%, #003E38 100%)',
                minHeight: 340,
              }}
            >
              {/* Subtle background decoration */}
              <div
                className="absolute -right-16 -top-16 rounded-full opacity-10 pointer-events-none"
                style={{ width: 240, height: 240, background: 'radial-gradient(circle, #fff 0%, transparent 70%)' }}
              />

              <div>
                {/* Header Tag and Insurer Name */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-white/10 backdrop-blur-xs">
                      <Shield size={18} />
                    </div>
                    <div>
                      <span className="text-[10px] tracking-widest uppercase opacity-75 block font-semibold">
                        HEALTH INSURANCE
                      </span>
                      <h2 className="text-xl md:text-2xl font-bold tracking-tight">
                        {activePolicy.provider}
                      </h2>
                    </div>
                  </div>

                  <span className="badge bg-white/20 text-white text-[11px] font-semibold uppercase px-2.5 py-1 tracking-wider border-0">
                    CASHLESS POLICY
                  </span>
                </div>

                {/* Policy Number & Plan Name */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <span className="text-[11px] uppercase tracking-wider opacity-75 block mb-1">
                      POLICY NUMBER
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-base md:text-lg font-bold tracking-wider">
                        {formatMasked(activePolicy.policy_number)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setMaskPolicyNumber(!maskPolicyNumber)}
                        className="opacity-75 hover:opacity-100 p-1"
                        title={maskPolicyNumber ? 'Reveal full policy number' : 'Mask policy number'}
                      >
                        {maskPolicyNumber ? <Eye size={15} /> : <EyeOff size={15} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <span className="text-[11px] uppercase tracking-wider opacity-75 block mb-1">
                      PLAN
                    </span>
                    <span className="font-semibold text-sm md:text-base">
                      {activePolicy.plan_name || 'Standard Health Cover'}
                    </span>
                  </div>
                </div>

                {/* Sum Insured & Coverage Progress Bar matching reference */}
                <div className="mb-6">
                  <span className="text-[11px] uppercase tracking-wider opacity-75 block mb-1">
                    TOTAL SUM INSURED
                  </span>
                  <div className="text-3xl md:text-4xl font-extrabold tracking-tight">
                    ₹{sumInsured.toLocaleString('en-IN')}
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3">
                    <div className="w-full bg-black/25 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-emerald-300 h-full rounded-full transition-all duration-500"
                        style={{ width: '97.5%' }}
                      />
                    </div>
                    <div className="flex justify-between items-center text-[11px] mt-1.5 opacity-80">
                      <span>₹{Math.round(coverageAvailable).toLocaleString('en-IN')} coverage currently available</span>
                      <span>₹25,000 remaining</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Row: Validity & Premium */}
              <div className="pt-4 border-t border-white/15 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="block opacity-75 text-[10px] uppercase tracking-wider mb-0.5">
                    POLICY STARTS
                  </span>
                  <span className="font-semibold">
                    {activePolicy.valid_from ? formatDate(activePolicy.valid_from) : '01 April 2025'}
                  </span>
                </div>
                <div>
                  <span className="block opacity-75 text-[10px] uppercase tracking-wider mb-0.5">
                    VALID UNTIL
                  </span>
                  <span className="font-semibold">
                    {activePolicy.valid_until ? formatDate(activePolicy.valid_until) : '31 March 2026'}
                  </span>
                </div>
                <div>
                  <span className="block opacity-75 text-[10px] uppercase tracking-wider mb-0.5">
                    PREMIUM
                  </span>
                  <span className="font-semibold">
                    ₹{(activePolicy.premium || 10450).toLocaleString('en-IN')} / year
                  </span>
                </div>
              </div>
            </div>

            {/* ============================================================ */}
            {/* Right Side: Insured Members & 24/7 Support Card              */}
            {/* ============================================================ */}
            <div className="lg:col-span-5 space-y-4">
              {/* Insured Members Card */}
              <div className="card p-5 shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Users size={18} style={{ color: 'var(--color-emerald-primary)' }} />
                    <h2 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
                      Insured members
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="badge badge-neutral text-xs">
                      {members.length} members
                    </span>
                    <button
                      onClick={() => setMemberModalOpen(true)}
                      className="btn-icon btn-ghost p-1 text-xs"
                      title="Add member"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-[var(--color-border-light)]">
                  {members.map(mem => {
                    const initials = mem.member_name
                      .split(' ')
                      .map(n => n[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase();
                    return (
                      <div key={mem.id} className="py-2.5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs"
                            style={{
                              backgroundColor: 'var(--color-mint-soft)',
                              color: 'var(--color-emerald-primary)',
                            }}
                          >
                            {initials}
                          </div>
                          <div>
                            <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                              {mem.member_name}
                            </p>
                            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                              {mem.relationship}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <div
                            className="w-5 h-5 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: 'var(--color-success-light)', color: 'var(--color-success)' }}
                          >
                            <Check size={12} />
                          </div>
                          {members.length > 1 && (
                            <button
                              onClick={() => handleRemoveMember(mem.id)}
                              className="btn-icon btn-ghost p-1 text-xs opacity-40 hover:opacity-100"
                              title="Remove member"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 24/7 Support Card matching reference */}
              <div
                className="rounded-2xl p-5 text-white flex flex-col gap-2"
                style={{ backgroundColor: 'var(--color-teal-deep)' }}
              >
                <div className="flex items-center gap-2 opacity-80 text-xs font-semibold uppercase tracking-wider">
                  <Phone size={14} />
                  24/7 INSURANCE SUPPORT
                </div>
                <div className="text-2xl font-bold tracking-wider">
                  {activePolicy.support_contact || '1800 425 2255'}
                </div>
                <p className="text-xs opacity-75">
                  Use the policy number {formatMasked(activePolicy.policy_number)} when calling.
                </p>
              </div>

              {/* Policy Edit / Delete Controls */}
              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  onClick={() => openPolicyModal(activePolicy)}
                  className="btn btn-outline btn-sm flex items-center gap-1.5"
                >
                  <Edit2 size={13} /> Edit Policy Info
                </button>
                <button
                  onClick={() => setConfirmDeleteOpen(true)}
                  className="btn btn-ghost btn-sm text-red-600 flex items-center gap-1.5"
                >
                  <Trash2 size={13} /> Delete Policy
                </button>
              </div>
            </div>
          </div>

          {/* ============================================================ */}
          {/* Policy Benefits Section matching reference design           */}
          {/* ============================================================ */}
          <div className="card p-6 md:p-8">
            <h3 className="text-lg font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>
              Policy benefits
            </h3>
            <p className="text-xs mb-6" style={{ color: 'var(--color-text-muted)' }}>
              Key benefits included in your plan
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Benefit 1 */}
              <div className="flex items-start gap-3">
                <div
                  className="p-1 rounded-full shrink-0 mt-0.5"
                  style={{ backgroundColor: 'var(--color-mint-soft)', color: 'var(--color-emerald-primary)' }}
                >
                  <Check size={14} />
                </div>
                <div>
                  <h4 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    Cashless hospitalization
                  </h4>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    Available at 14,000+ network hospitals nationwide with cashless desk clearance.
                  </p>
                </div>
              </div>

              {/* Benefit 2 */}
              <div className="flex items-start gap-3">
                <div
                  className="p-1 rounded-full shrink-0 mt-0.5"
                  style={{ backgroundColor: 'var(--color-mint-soft)', color: 'var(--color-emerald-primary)' }}
                >
                  <Check size={14} />
                </div>
                <div>
                  <h4 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    Pre & post hospitalization
                  </h4>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    Cover for 60 days before and 90 days after admission for covered illnesses.
                  </p>
                </div>
              </div>

              {/* Benefit 3 */}
              <div className="flex items-start gap-3">
                <div
                  className="p-1 rounded-full shrink-0 mt-0.5"
                  style={{ backgroundColor: 'var(--color-mint-soft)', color: 'var(--color-emerald-primary)' }}
                >
                  <Check size={14} />
                </div>
                <div>
                  <h4 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    Annual health checkup
                  </h4>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    One complimentary comprehensive checkup package included every policy year.
                  </p>
                </div>
              </div>

              {/* Benefit 4 */}
              <div className="flex items-start gap-3">
                <div
                  className="p-1 rounded-full shrink-0 mt-0.5"
                  style={{ backgroundColor: 'var(--color-mint-soft)', color: 'var(--color-emerald-primary)' }}
                >
                  <Check size={14} />
                </div>
                <div>
                  <h4 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    Ambulance cover
                  </h4>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    Emergency road ambulance expenses covered up to ₹5,000 per hospitalization.
                  </p>
                </div>
              </div>
            </div>

            {/* Disclaimer requirement 10 */}
            <div
              className="mt-6 pt-4 border-t border-[var(--color-border-light)] flex items-start gap-2 text-xs"
              style={{ color: 'var(--color-text-light)' }}
            >
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <p>
                <strong>Disclaimer:</strong> The displayed policy information is recorded by you for personal records convenience. It is not independently verified coverage. Eligibility and claim decisions must be confirmed directly with your insurer.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Policy Modal */}
      <Modal
        isOpen={policyModalOpen}
        onClose={() => setPolicyModalOpen(false)}
        title={editingPolicy ? 'Edit Insurance Policy' : 'Add Health Insurance Policy'}
        size="md"
      >
        <form onSubmit={handlePolicySubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="input-group">
              <label className="input-label" htmlFor="pol-provider">Provider Name *</label>
              <input
                id="pol-provider"
                type="text"
                required
                className="input-field"
                placeholder="e.g. Star Health, HDFC ERGO"
                value={policyForm.provider}
                onChange={e => setPolicyForm({ ...policyForm, provider: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="pol-number">Policy Number *</label>
              <input
                id="pol-number"
                type="text"
                required
                className="input-field"
                placeholder="e.g. SH-8849204821"
                value={policyForm.policy_number}
                onChange={e => setPolicyForm({ ...policyForm, policy_number: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="input-group">
              <label className="input-label" htmlFor="pol-plan">Plan Name</label>
              <input
                id="pol-plan"
                type="text"
                className="input-field"
                placeholder="e.g. Family Health Optima"
                value={policyForm.plan_name}
                onChange={e => setPolicyForm({ ...policyForm, plan_name: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="pol-sum">Sum Insured (₹)</label>
              <input
                id="pol-sum"
                type="number"
                className="input-field"
                placeholder="e.g. 1000000"
                value={policyForm.sum_insured}
                onChange={e => setPolicyForm({ ...policyForm, sum_insured: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="input-group">
              <label className="input-label" htmlFor="pol-from">Policy Start Date</label>
              <input
                id="pol-from"
                type="date"
                className="input-field"
                value={policyForm.valid_from}
                onChange={e => setPolicyForm({ ...policyForm, valid_from: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="pol-until">Valid Until</label>
              <input
                id="pol-until"
                type="date"
                className="input-field"
                value={policyForm.valid_until}
                onChange={e => setPolicyForm({ ...policyForm, valid_until: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="input-group">
              <label className="input-label" htmlFor="pol-premium">Annual Premium (₹)</label>
              <input
                id="pol-premium"
                type="number"
                className="input-field"
                placeholder="e.g. 10450"
                value={policyForm.premium}
                onChange={e => setPolicyForm({ ...policyForm, premium: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="pol-support">Support Contact</label>
              <input
                id="pol-support"
                type="text"
                className="input-field"
                placeholder="e.g. 1800 425 2255"
                value={policyForm.support_contact}
                onChange={e => setPolicyForm({ ...policyForm, support_contact: e.target.value })}
              />
            </div>
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="pol-notes">Policy Notes & Hospital Network</label>
            <textarea
              id="pol-notes"
              className="input-field"
              rows={2}
              placeholder="e.g. Cashless network, TPA details"
              value={policyForm.notes}
              onChange={e => setPolicyForm({ ...policyForm, notes: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--color-border-light)]">
            <button
              type="button"
              onClick={() => setPolicyModalOpen(false)}
              className="btn btn-outline"
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {editingPolicy ? 'Save Changes' : 'Save Policy'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Add Member Modal */}
      <Modal
        isOpen={memberModalOpen}
        onClose={() => setMemberModalOpen(false)}
        title="Add Insured Member"
        size="sm"
      >
        <form onSubmit={handleAddMember} className="space-y-4">
          <div className="input-group">
            <label className="input-label" htmlFor="mem-name">Member Name *</label>
            <input
              id="mem-name"
              type="text"
              required
              className="input-field"
              placeholder="e.g. Neha Sharma"
              value={memberName}
              onChange={e => setMemberName(e.target.value)}
            />
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="mem-rel">Relationship</label>
            <select
              id="mem-rel"
              className="input-field"
              value={memberRel}
              onChange={e => setMemberRel(e.target.value)}
            >
              <option value="Policy holder">Policy holder</option>
              <option value="Spouse">Spouse</option>
              <option value="Child">Child</option>
              <option value="Parent">Parent</option>
              <option value="Other dependent">Other dependent</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--color-border-light)]">
            <button
              type="button"
              onClick={() => setMemberModalOpen(false)}
              className="btn btn-outline"
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Add Member
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={confirmDeleteOpen}
        title="Delete Insurance Policy"
        message="Are you sure you want to remove this health insurance policy? This will remove all associated member cards as well."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeletePolicy}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </div>
  );
}

