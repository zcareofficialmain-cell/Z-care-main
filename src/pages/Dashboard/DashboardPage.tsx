import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Pill,
  Shield,
  Stethoscope,
  Bell,
  Plus,
  Download,
  AlertTriangle,
  ArrowRight,
  Calendar,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  getMedications,
  getAllergies,
  getInsurancePolicies,
  getConsultations,
  getMedicalDocuments,
  getReminders,
  getLabResults,
} from '@/services/api';
import { generateHealthSummaryPDF } from '@/services/pdfGenerator';
import { useToast } from '@/components/ui/Toast';
import EmptyState from '@/components/ui/EmptyState';
import type {
  Medication,
  Allergy,
  InsurancePolicy,
  Consultation,
  MedicalDocument,
  Reminder,
} from '@/types';
import type { LabResult } from '@/types/medicalExtraction';
import { formatDate } from '@/utils';

export default function DashboardPage() {
  const { user, profile, isDemoUser } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [allergies, setAllergies] = useState<Allergy[]>([]);
  const [policies, setPolicies] = useState<InsurancePolicy[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [documents, setDocuments] = useState<MedicalDocument[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [labResults, setLabResults] = useState<LabResult[]>([]);
  const [downloadingPDF, setDownloadingPDF] = useState(false);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [m, a, p, c, d, r, l] = await Promise.all([
        getMedications(user.id),
        getAllergies(user.id),
        getInsurancePolicies(user.id),
        getConsultations(user.id),
        getMedicalDocuments(user.id),
        getReminders(user.id),
        getLabResults(user.id),
      ]);
      setMedications(m);
      setAllergies(a);
      setPolicies(p);
      setConsultations(c);
      setDocuments(d);
      setReminders(r);
      setLabResults(l);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const handleDownloadPDF = () => {
    setDownloadingPDF(true);
    try {
      generateHealthSummaryPDF(
        profile,
        medications,
        allergies,
        consultations,
        policies,
        documents,
        reminders,
        labResults
      );
      showToast('success', 'Health summary PDF downloaded successfully!');
    } catch (err) {
      showToast('error', 'Failed to generate PDF summary.');
    } finally {
      setDownloadingPDF(false);
    }
  };

  const hasAnyData =
    medications.length > 0 ||
    allergies.length > 0 ||
    policies.length > 0 ||
    consultations.length > 0 ||
    documents.length > 0 ||
    reminders.length > 0;

  const activeMeds = medications.filter(m => m.status === 'active');
  const primaryPolicy = policies[0];
  const upcomingReminders = reminders.filter(r => r.status === 'upcoming');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Top Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
              Welcome to ZCare{profile?.full_name ? `, ${profile.full_name}` : ''}
            </h1>
            {isDemoUser && (
              <span
                className="badge inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full"
                style={{ backgroundColor: 'var(--color-mint-soft)', color: 'var(--color-emerald-primary)' }}
              >
                <Sparkles size={12} />
                Demo Account
              </span>
            )}
          </div>
          <p className="text-sm md:text-base" style={{ color: 'var(--color-text-muted)' }}>
            Keep every important health detail organised and easily notify when you need it.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleDownloadPDF}
            disabled={downloadingPDF}
            className="btn btn-outline flex items-center gap-2"
            title="Download comprehensive patient health summary"
          >
            <Download size={16} />
            <span className="hidden sm:inline">Health Summary</span> (PDF)
          </button>

          <button
            onClick={() => navigate('/medications')}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus size={16} />
            Add Details
          </button>
        </div>
      </div>

      {/* Allergies Highlight Banner (if any severe/moderate allergies exist) */}
      {allergies.length > 0 && (
        <div
          className="mb-8 p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
          style={{
            backgroundColor: 'var(--color-warning-light)',
            borderColor: 'var(--color-warning)',
          }}
        >
          <div className="flex items-start sm:items-center gap-3">
            <div
              className="p-2 rounded-lg shrink-0"
              style={{ backgroundColor: 'rgba(217, 119, 6, 0.15)', color: 'var(--color-warning)' }}
            >
              <AlertTriangle size={20} />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider block" style={{ color: 'var(--color-warning)' }}>
                Medical Alert — Known Allergies
              </span>
              <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                {allergies.map(a => `${a.allergen} (${a.severity.toUpperCase()})`).join(' • ')}
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/medications')}
            className="text-xs font-semibold flex items-center gap-1 hover:underline shrink-0"
            style={{ color: 'var(--color-warning)' }}
          >
            Review Allergies <ArrowRight size={14} />
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <RefreshCw className="animate-spin" size={32} style={{ color: 'var(--color-emerald-primary)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>
            Loading your health space...
          </span>
        </div>
      ) : !hasAnyData ? (
        /* Empty State matching reference image: "No health details added yet" */
        <div className="card p-12 text-center max-w-xl mx-auto my-8 border border-dashed border-[var(--color-border)]">
          <div
            className="mx-auto mb-4 flex items-center justify-center rounded-2xl"
            style={{ width: 72, height: 72, backgroundColor: 'var(--color-mint-soft)' }}
          >
            <FileText size={36} style={{ color: 'var(--color-emerald-primary)' }} />
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>
            No health details added yet.
          </h2>
          <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
            Add your first health record to start building your health history. You can track medications, doctor consultations, insurance policies, and reminders all in one place.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={() => navigate('/medications')}
              className="btn btn-primary"
            >
              <Plus size={16} /> Add Details
            </button>
          </div>
        </div>
      ) : (
        /* Dashboard Summary Grid matching reference */
        <div className="space-y-8">
          {/* 4 Primary Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Medications Card */}
            <div
              onClick={() => navigate('/medications')}
              className="card card-hover p-5 cursor-pointer relative overflow-hidden flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-light)' }}>
                    Current Medications
                  </span>
                  <div
                    className="p-2 rounded-lg"
                    style={{ backgroundColor: 'var(--color-mint-soft)', color: 'var(--color-emerald-primary)' }}
                  >
                    <Pill size={18} />
                  </div>
                </div>
                <div className="text-3xl font-extrabold mb-1" style={{ color: 'var(--color-teal-deep)' }}>
                  {activeMeds.length}
                  <span className="text-sm font-normal ml-1" style={{ color: 'var(--color-text-muted)' }}>
                    active
                  </span>
                </div>
                <p className="text-xs line-clamp-1" style={{ color: 'var(--color-text-muted)' }}>
                  {activeMeds.length > 0 ? activeMeds.map(m => m.name).join(', ') : 'No active medications'}
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-[var(--color-border-light)] flex items-center justify-between text-xs font-medium" style={{ color: 'var(--color-emerald-primary)' }}>
                <span>View medications</span>
                <ArrowRight size={14} />
              </div>
            </div>

            {/* Doctor History Card */}
            <div
              onClick={() => navigate('/consultations')}
              className="card card-hover p-5 cursor-pointer relative overflow-hidden flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-light)' }}>
                    Doctor Consultations
                  </span>
                  <div
                    className="p-2 rounded-lg"
                    style={{ backgroundColor: 'var(--color-mint-soft)', color: 'var(--color-emerald-primary)' }}
                  >
                    <Stethoscope size={18} />
                  </div>
                </div>
                <div className="text-3xl font-extrabold mb-1" style={{ color: 'var(--color-teal-deep)' }}>
                  {consultations.length}
                  <span className="text-sm font-normal ml-1" style={{ color: 'var(--color-text-muted)' }}>
                    recorded
                  </span>
                </div>
                <p className="text-xs line-clamp-1" style={{ color: 'var(--color-text-muted)' }}>
                  {consultations[0] ? `Latest: ${consultations[0].doctor_name}` : 'No consultations logged'}
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-[var(--color-border-light)] flex items-center justify-between text-xs font-medium" style={{ color: 'var(--color-emerald-primary)' }}>
                <span>View care timeline</span>
                <ArrowRight size={14} />
              </div>
            </div>

            {/* Health Insurance Card */}
            <div
              onClick={() => navigate('/insurance')}
              className="card card-hover p-5 cursor-pointer relative overflow-hidden flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-light)' }}>
                    Health Insurance
                  </span>
                  <div
                    className="p-2 rounded-lg"
                    style={{ backgroundColor: 'var(--color-mint-soft)', color: 'var(--color-emerald-primary)' }}
                  >
                    <Shield size={18} />
                  </div>
                </div>
                <div className="text-2xl font-extrabold mb-1 truncate" style={{ color: 'var(--color-teal-deep)' }}>
                  {primaryPolicy ? `₹${(primaryPolicy.sum_insured || 0).toLocaleString('en-IN')}` : 'No Policy'}
                </div>
                <p className="text-xs line-clamp-1" style={{ color: 'var(--color-text-muted)' }}>
                  {primaryPolicy ? primaryPolicy.provider : 'Store your policy details'}
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-[var(--color-border-light)] flex items-center justify-between text-xs font-medium" style={{ color: 'var(--color-emerald-primary)' }}>
                <span>{primaryPolicy ? 'Active policy' : 'Add policy'}</span>
                <ArrowRight size={14} />
              </div>
            </div>

            {/* Reminders Card */}
            <div
              onClick={() => navigate('/reminders')}
              className="card card-hover p-5 cursor-pointer relative overflow-hidden flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-light)' }}>
                    Reminders & Checkups
                  </span>
                  <div
                    className="p-2 rounded-lg"
                    style={{ backgroundColor: 'var(--color-mint-soft)', color: 'var(--color-emerald-primary)' }}
                  >
                    <Bell size={18} />
                  </div>
                </div>
                <div className="text-3xl font-extrabold mb-1" style={{ color: 'var(--color-teal-deep)' }}>
                  {upcomingReminders.length}
                  <span className="text-sm font-normal ml-1" style={{ color: 'var(--color-text-muted)' }}>
                    upcoming
                  </span>
                </div>
                <p className="text-xs line-clamp-1" style={{ color: 'var(--color-text-muted)' }}>
                  {upcomingReminders[0] ? upcomingReminders[0].title : 'All clear for now'}
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-[var(--color-border-light)] flex items-center justify-between text-xs font-medium" style={{ color: 'var(--color-emerald-primary)' }}>
                <span>Open reminders calendar</span>
                <ArrowRight size={14} />
              </div>
            </div>
          </div>

          {/* Two Column Section: Recent Medications / Consultations and Upcoming Reminders */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 cols: Active Medications & Recent Consultations */}
            <div className="lg:col-span-2 space-y-6">
              {/* Active Medications Preview */}
              <div className="card p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Pill size={18} style={{ color: 'var(--color-emerald-primary)' }} />
                    <h2 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
                      Current Medications ({activeMeds.length})
                    </h2>
                  </div>
                  <button
                    onClick={() => navigate('/medications')}
                    className="text-xs font-semibold flex items-center gap-1 hover:underline"
                    style={{ color: 'var(--color-emerald-primary)' }}
                  >
                    Manage all <ArrowRight size={14} />
                  </button>
                </div>

                <div className="divide-y divide-[var(--color-border-light)]">
                  {activeMeds.slice(0, 3).map(med => (
                    <div key={med.id} className="py-3 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                            {med.name}
                          </span>
                          {med.strength && (
                            <span className="text-xs px-2 py-0.5 rounded-md font-medium" style={{ backgroundColor: 'var(--color-mint-soft)', color: 'var(--color-teal-deep)' }}>
                              {med.strength}
                            </span>
                          )}
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                          {med.frequency} {med.instructions ? `• ${med.instructions}` : ''}
                        </p>
                      </div>
                      <span className="badge badge-success text-xs font-medium uppercase">
                        Active
                      </span>
                    </div>
                  ))}
                  {activeMeds.length === 0 && (
                    <p className="text-sm py-4 text-center" style={{ color: 'var(--color-text-muted)' }}>
                      No active medications currently recorded.
                    </p>
                  )}
                </div>
              </div>

              {/* Recent Consultations Timeline Preview */}
              <div className="card p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Stethoscope size={18} style={{ color: 'var(--color-emerald-primary)' }} />
                    <h2 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
                      Recent Doctor Consultations
                    </h2>
                  </div>
                  <button
                    onClick={() => navigate('/consultations')}
                    className="text-xs font-semibold flex items-center gap-1 hover:underline"
                    style={{ color: 'var(--color-emerald-primary)' }}
                  >
                    View all ({consultations.length}) <ArrowRight size={14} />
                  </button>
                </div>

                <div className="space-y-3">
                  {consultations.slice(0, 3).map(c => (
                    <div
                      key={c.id}
                      className="p-3.5 rounded-xl border border-[var(--color-border-light)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-[var(--color-bg-page)] transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                            {c.doctor_name}
                          </span>
                          {c.specialty && (
                            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                              • {c.specialty}
                            </span>
                          )}
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                          {c.hospital_name || 'Clinic'} {c.reason ? `• ${c.reason}` : ''}
                        </p>
                      </div>
                      <div className="text-xs font-medium text-right shrink-0" style={{ color: 'var(--color-emerald-primary)' }}>
                        {formatDate(c.consultation_date)}
                      </div>
                    </div>
                  ))}
                  {consultations.length === 0 && (
                    <p className="text-sm py-4 text-center" style={{ color: 'var(--color-text-muted)' }}>
                      No consultations logged yet.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Right 1 col: Upcoming Reminders & Quick Actions */}
            <div className="space-y-6">
              {/* Upcoming Reminders Card */}
              <div className="card p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Calendar size={18} style={{ color: 'var(--color-emerald-primary)' }} />
                    <h2 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
                      Upcoming Agenda
                    </h2>
                  </div>
                  <button
                    onClick={() => navigate('/reminders')}
                    className="text-xs font-semibold flex items-center gap-1 hover:underline"
                    style={{ color: 'var(--color-emerald-primary)' }}
                  >
                    Calendar <ArrowRight size={14} />
                  </button>
                </div>

                <div className="space-y-3">
                  {upcomingReminders.slice(0, 4).map(rem => (
                    <div
                      key={rem.id}
                      className="p-3 rounded-lg border border-[var(--color-border-light)] flex items-start gap-3"
                    >
                      <div
                        className="p-2 rounded-lg shrink-0 mt-0.5"
                        style={{
                          backgroundColor:
                            rem.type === 'blood-test'
                              ? 'var(--color-info-light)'
                              : rem.type === 'vaccination'
                              ? 'var(--color-warning-light)'
                              : 'var(--color-mint-soft)',
                          color:
                            rem.type === 'blood-test'
                              ? 'var(--color-info)'
                              : rem.type === 'vaccination'
                              ? 'var(--color-warning)'
                              : 'var(--color-emerald-primary)',
                        }}
                      >
                        <Bell size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
                          {rem.title}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                          {formatDate(rem.due_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                  {upcomingReminders.length === 0 && (
                    <p className="text-xs py-4 text-center" style={{ color: 'var(--color-text-muted)' }}>
                      No upcoming reminders scheduled.
                    </p>
                  )}
                </div>
              </div>

              {/* Quick Actions Panel */}
              <div
                className="card p-6"
                style={{
                  backgroundColor: 'var(--color-mint-lighter)',
                  borderColor: 'var(--color-border)',
                }}
              >
                <h3 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--color-teal-deep)' }}>
                  Quick Actions
                </h3>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => navigate('/medications')}
                    className="btn btn-outline btn-sm w-full justify-start bg-white"
                  >
                    <Plus size={14} /> + New Medication / Allergy
                  </button>
                  <button
                    onClick={() => navigate('/consultations')}
                    className="btn btn-outline btn-sm w-full justify-start bg-white"
                  >
                    <Plus size={14} /> + Log Doctor Consultation
                  </button>
                  <button
                    onClick={() => navigate('/reminders')}
                    className="btn btn-outline btn-sm w-full justify-start bg-white"
                  >
                    <Plus size={14} /> + Schedule Health Reminder
                  </button>
                  <button
                    onClick={() => navigate('/records')}
                    className="btn btn-outline btn-sm w-full justify-start bg-white"
                  >
                    <Plus size={14} /> + Upload & Extract Medical Document
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

