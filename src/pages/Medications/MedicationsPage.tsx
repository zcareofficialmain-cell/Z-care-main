import { useEffect, useState } from 'react';
import { useStartAction } from '@/hooks/useStartAction';
import {
  Pill,
  AlertTriangle,
  Plus,
  CheckCircle,
  Edit2,
  Trash2,
  Calendar,
  Clock,
  Info,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  getMedications,
  createMedication,
  updateMedication,
  deleteMedication,
  getAllergies,
  createAllergy,
  updateAllergy,
  deleteAllergy,
  getInvalidMedicalRecords,
  cleanupInvalidMedicalRecords,
  type InvalidMedicalRecordInfo,
} from '@/services/api';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import type {
  Medication,
  MedicationFormData,
  MedicationStatus,
  Allergy,
  AllergyFormData,
  AllergySeverity,
  VerificationStatus,
} from '@/types';
import { formatDate } from '@/utils';

export default function MedicationsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [medications, setMedications] = useState<Medication[]>([]);
  const [allergies, setAllergies] = useState<Allergy[]>([]);
  const [loading, setLoading] = useState(true);

  // Medication Modal State
  const [medModalOpen, setMedModalOpen] = useState(false);
  const [editingMed, setEditingMed] = useState<Medication | null>(null);
  const [medForm, setMedForm] = useState<MedicationFormData>({
    name: '',
    strength: '',
    dose: '',
    route: 'oral',
    frequency: 'Once daily',
    instructions: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    status: 'active',
    notes: '',
  });

  // Allergy Modal State
  const [algModalOpen, setAlgModalOpen] = useState(false);
  const [editingAlg, setEditingAlg] = useState<Allergy | null>(null);
  const [algForm, setAlgForm] = useState<AllergyFormData>({
    allergen: '',
    reaction: '',
    severity: 'mild',
    first_noted_at: '',
    source: 'Medication',
    verification_status: 'patient-reported',
    notes: '',
  });

  // Delete Confirm Dialog State
  const [confirmDelete, setConfirmDelete] = useState<{
    open: boolean;
    type: 'medication' | 'allergy';
    id: string;
    name: string;
  }>({
    open: false,
    type: 'medication',
    id: '',
    name: '',
  });

  // Invalid / Corrupted Records State (Safe Data Quality Cleanup)
  const [invalidRecords, setInvalidRecords] = useState<InvalidMedicalRecordInfo[]>([]);
  const [cleanupModalOpen, setCleanupModalOpen] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [meds, algs, invalidData] = await Promise.all([
        getMedications(user.id),
        getAllergies(user.id),
        getInvalidMedicalRecords(user.id),
      ]);
      setMedications(meds);
      setAllergies(algs);
      setInvalidRecords(invalidData.allInvalid);
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to load treatment overview');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  // Handle Medication Submission
  const handleMedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !medForm.name.trim()) return;

    try {
      if (editingMed) {
        await updateMedication(user.id, editingMed.id, medForm);
        showToast('success', 'Medication updated successfully');
      } else {
        await createMedication(user.id, medForm);
        showToast('success', 'Medication added successfully');
      }
      setMedModalOpen(false);
      setEditingMed(null);
      loadData();
    } catch (err) {
      showToast('error', 'Failed to save medication');
    }
  };

  const openMedModal = (med?: Medication) => {
    if (med) {
      setEditingMed(med);
      setMedForm({
        name: med.name,
        strength: med.strength || '',
        dose: med.dose || '',
        route: med.route || 'oral',
        frequency: med.frequency || 'Once daily',
        instructions: med.instructions || '',
        start_date: med.start_date || '',
        end_date: med.end_date || '',
        status: med.status,
        notes: med.notes || '',
      });
    } else {
      setEditingMed(null);
      setMedForm({
        name: '',
        strength: '',
        dose: '',
        route: 'oral',
        frequency: 'Once daily',
        instructions: '',
        start_date: new Date().toISOString().split('T')[0],
        end_date: '',
        status: 'active',
        notes: '',
      });
    }
    setMedModalOpen(true);
  };

  // Welcome modal "Add Health Details" → the existing Add Medication modal.
  useStartAction('medication', medModalOpen, () => openMedModal());

  // Handle Allergy Submission
  const handleAlgSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !algForm.allergen.trim()) return;

    try {
      if (editingAlg) {
        await updateAllergy(user.id, editingAlg.id, algForm);
        showToast('success', 'Allergy record updated');
      } else {
        await createAllergy(user.id, algForm);
        showToast('success', 'Allergy added to medical record');
      }
      setAlgModalOpen(false);
      setEditingAlg(null);
      loadData();
    } catch (err) {
      showToast('error', 'Failed to save allergy');
    }
  };

  const openAlgModal = (alg?: Allergy) => {
    if (alg) {
      setEditingAlg(alg);
      setAlgForm({
        allergen: alg.allergen,
        reaction: alg.reaction || '',
        severity: alg.severity,
        first_noted_at: alg.first_noted_at || '',
        source: alg.source || 'Medication',
        verification_status: alg.verification_status,
        notes: alg.notes || '',
      });
    } else {
      setEditingAlg(null);
      setAlgForm({
        allergen: '',
        reaction: '',
        severity: 'moderate',
        first_noted_at: '',
        source: 'Medication',
        verification_status: 'patient-reported',
        notes: '',
      });
    }
    setAlgModalOpen(true);
  };

  // Confirm Delete Handler
  const handleDeleteConfirm = async () => {
    if (!user) return;
    try {
      if (confirmDelete.type === 'medication') {
        await deleteMedication(user.id, confirmDelete.id);
        showToast('success', 'Medication removed');
      } else {
        await deleteAllergy(user.id, confirmDelete.id);
        showToast('success', 'Allergy removed');
      }
      setConfirmDelete(prev => ({ ...prev, open: false }));
      loadData();
    } catch (err) {
      showToast('error', 'Failed to delete record');
    }
  };

  const activeMeds = medications.filter(m => m.status === 'active');

  const getSeverityBadge = (sev: AllergySeverity) => {
    switch (sev) {
      case 'severe':
      case 'life-threatening':
        return (
          <span className="badge badge-danger text-xs font-bold uppercase tracking-wider">
            SEVERE
          </span>
        );
      case 'moderate':
        return (
          <span className="badge badge-warning text-xs font-bold uppercase tracking-wider">
            MODERATE
          </span>
        );
      case 'mild':
      default:
        return (
          <span className="badge badge-info text-xs font-bold uppercase tracking-wider">
            MILD
          </span>
        );
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Screen 5 Header matching reference */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--color-emerald-primary)' }}>
            YOUR TREATMENT OVERVIEW
          </span>
          <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
            Medications & allergies
          </h1>
          <p className="text-sm md:text-base mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Keep your current medicines and known allergies together for safer care.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{ backgroundColor: 'var(--color-mint-soft)', color: 'var(--color-emerald-primary)' }}
          >
            <CheckCircle size={14} />
            Profile up to date
          </div>
        </div>
      </div>

      {/* Data Quality Cleanup Banner if unvalidated text fragments exist */}
      {invalidRecords.length > 0 && (
        <div className="mb-8 p-4 rounded-2xl border border-amber-300 bg-amber-50/90 dark:bg-amber-950/30 dark:border-amber-800 text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-amber-200/80 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 shrink-0 mt-0.5">
              <AlertTriangle size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-amber-950 dark:text-amber-100">
                  Data Quality Notice: Corrupted Entries Detected
                </h3>
                <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-amber-200 text-amber-950 dark:bg-amber-900 dark:text-amber-100">
                  {invalidRecords.length} {invalidRecords.length === 1 ? 'entry' : 'entries'}
                </span>
              </div>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-1 max-w-2xl leading-relaxed">
                Earlier document scans may have saved unvalidated text fragments (such as sentence fragments, document disclaimers, or dates) as medications or allergies. You can review and safely purge these entries without affecting your genuine patient records.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
            <button
              onClick={() => setCleanupModalOpen(true)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Trash2 size={14} /> Review & Clean Up
            </button>
          </div>
        </div>
      )}

      {/* Two Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* ============================================================ */}
        {/* Left Column: Current Medications                             */}
        {/* ============================================================ */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="p-1.5 rounded-lg"
                style={{ backgroundColor: 'var(--color-mint-soft)', color: 'var(--color-emerald-primary)' }}
              >
                <Pill size={18} />
              </div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
                Current medications
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="badge badge-success text-xs font-semibold">
                {activeMeds.length} active
              </span>
              <button
                onClick={() => openMedModal()}
                className="btn btn-primary btn-sm flex items-center gap-1"
              >
                <Plus size={14} /> Add
              </button>
            </div>
          </div>

          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Medicines you are currently taking
          </p>

          {/* Medications Cards List */}
          <div className="space-y-3 mt-3">
            {medications.map(med => (
              <div
                key={med.id}
                className="card p-5 hover:border-[var(--color-emerald-primary)] transition-all shadow-xs"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="p-2 rounded-xl shrink-0"
                      style={{ backgroundColor: 'var(--color-mint-lighter)', color: 'var(--color-emerald-primary)' }}
                    >
                      <Pill size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-base" style={{ color: 'var(--color-text-primary)' }}>
                          {med.name}
                        </h3>
                        {med.strength && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-md" style={{ backgroundColor: 'var(--color-mint-soft)', color: 'var(--color-teal-deep)' }}>
                            {med.strength}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`badge text-xs font-semibold uppercase ${
                        med.status === 'active'
                          ? 'badge-success'
                          : med.status === 'paused'
                          ? 'badge-warning'
                          : 'badge-neutral'
                      }`}
                    >
                      {med.status}
                    </span>
                    <button
                      onClick={() => openMedModal(med)}
                      className="btn-icon btn-ghost text-xs p-1"
                      title="Edit medication"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() =>
                        setConfirmDelete({
                          open: true,
                          type: 'medication',
                          id: med.id,
                          name: med.name,
                        })
                      }
                      className="btn-icon btn-ghost text-xs p-1 hover:text-red-600"
                      title="Delete medication"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Medication Details Grid matching reference */}
                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[var(--color-border-light)] text-xs">
                  <div>
                    <span className="block font-medium mb-0.5" style={{ color: 'var(--color-text-light)' }}>
                      Schedule
                    </span>
                    <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                      {med.frequency || 'Daily'}
                    </span>
                  </div>
                  <div>
                    <span className="block font-medium mb-0.5" style={{ color: 'var(--color-text-light)' }}>
                      Instructions
                    </span>
                    <span className="font-semibold line-clamp-1" style={{ color: 'var(--color-text-primary)' }}>
                      {med.instructions || 'As advised'}
                    </span>
                  </div>
                  <div>
                    <span className="block font-medium mb-0.5" style={{ color: 'var(--color-text-light)' }}>
                      Started
                    </span>
                    <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                      {med.start_date ? `Since ${formatDate(med.start_date)}` : 'Recorded'}
                    </span>
                  </div>
                </div>

                {med.notes && (
                  <p className="mt-2.5 pt-2 border-t border-[var(--color-border-light)] text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    <strong>Note:</strong> {med.notes}
                  </p>
                )}
              </div>
            ))}

            {medications.length === 0 && !loading && (
              <div className="card p-8 text-center border-dashed border-[var(--color-border)]">
                <Pill size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>
                  No medications added yet.
                </p>
                <button
                  onClick={() => openMedModal()}
                  className="btn btn-outline btn-sm mt-3"
                >
                  <Plus size={14} /> Add First Medication
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ============================================================ */}
        {/* Right Column: Known Allergies                                */}
        {/* ============================================================ */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="p-1.5 rounded-lg"
                style={{ backgroundColor: 'var(--color-warning-light)', color: 'var(--color-warning)' }}
              >
                <AlertTriangle size={18} />
              </div>
              <div>
                <h2 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
                  Known allergies
                </h2>
              </div>
            </div>
            <button
              onClick={() => openAlgModal()}
              className="btn btn-primary btn-sm flex items-center gap-1"
            >
              <Plus size={14} /> Add
            </button>
          </div>

          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Share these with every care provider
          </p>

          {/* Allergies Cards List */}
          <div className="space-y-3 mt-3">
            {allergies.map(alg => (
              <div
                key={alg.id}
                className="card p-5 hover:border-[var(--color-emerald-primary)] transition-all shadow-xs"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    {alg.source && (
                      <span className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-[var(--color-text-light)]">
                        {alg.source}
                      </span>
                    )}
                    <h3 className="font-bold text-base" style={{ color: 'var(--color-text-primary)' }}>
                      {alg.allergen}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2">
                    {getSeverityBadge(alg.severity)}
                    <button
                      onClick={() => openAlgModal(alg)}
                      className="btn-icon btn-ghost text-xs p-1"
                      title="Edit allergy"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() =>
                        setConfirmDelete({
                          open: true,
                          type: 'allergy',
                          id: alg.id,
                          name: alg.allergen,
                        })
                      }
                      className="btn-icon btn-ghost text-xs p-1 hover:text-red-600"
                      title="Delete allergy"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
                  {alg.reaction && (
                    <p className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      {alg.reaction}
                    </p>
                  )}
                  {alg.notes && (
                    <p className="mt-1 text-[11px] opacity-80">{alg.notes}</p>
                  )}
                </div>

                <div className="mt-3 pt-2.5 border-t border-[var(--color-border-light)] flex items-center justify-between text-[11px]" style={{ color: 'var(--color-text-light)' }}>
                  <span>Status: <strong className="font-semibold text-[var(--color-text-primary)]">{alg.verification_status}</strong></span>
                  {alg.first_noted_at && (
                    <span>Noted: {formatDate(alg.first_noted_at)}</span>
                  )}
                </div>
              </div>
            ))}

            {allergies.length === 0 && !loading && (
              <div className="card p-8 text-center border-dashed border-[var(--color-border)]">
                <AlertTriangle size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>
                  No allergies reported.
                </p>
                <button
                  onClick={() => openAlgModal()}
                  className="btn btn-outline btn-sm mt-3"
                >
                  <Plus size={14} /> Add Allergy
                </button>
              </div>
            )}
          </div>

          {/* Bottom Alert Notice Box matching reference design */}
          <div
            className="p-4 rounded-xl border flex items-start gap-3 mt-6"
            style={{
              backgroundColor: 'var(--color-mint-lighter)',
              borderColor: 'var(--color-border)',
            }}
          >
            <Info size={18} className="shrink-0 mt-0.5" style={{ color: 'var(--color-emerald-primary)' }} />
            <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
              Allergy information is highlighted whenever prescriptions are created or when you review or share your health record with healthcare providers.
            </p>
          </div>
        </div>
      </div>

      {/* Medication Add/Edit Modal */}
      <Modal
        isOpen={medModalOpen}
        onClose={() => setMedModalOpen(false)}
        title={editingMed ? 'Edit Medication' : 'Add Medication'}
        size="md"
      >
        <form onSubmit={handleMedSubmit} className="space-y-4">
          <div className="input-group">
            <label className="input-label" htmlFor="med-name">Medication Name *</label>
            <input
              id="med-name"
              type="text"
              required
              className="input-field"
              placeholder="e.g. Metformin, Vitamin D3, Atorvastatin"
              value={medForm.name}
              onChange={e => setMedForm({ ...medForm, name: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="input-group">
              <label className="input-label" htmlFor="med-strength">Strength</label>
              <input
                id="med-strength"
                type="text"
                className="input-field"
                placeholder="e.g. 500 mg, 1,000 IU"
                value={medForm.strength}
                onChange={e => setMedForm({ ...medForm, strength: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="med-dose">Dose</label>
              <input
                id="med-dose"
                type="text"
                className="input-field"
                placeholder="e.g. 1 tablet, 5 ml"
                value={medForm.dose}
                onChange={e => setMedForm({ ...medForm, dose: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="input-group">
              <label className="input-label" htmlFor="med-freq">Schedule / Frequency</label>
              <select
                id="med-freq"
                className="input-field"
                value={medForm.frequency}
                onChange={e => setMedForm({ ...medForm, frequency: e.target.value })}
              >
                <option value="Once daily">Once daily</option>
                <option value="Twice daily">Twice daily</option>
                <option value="Thrice daily">Thrice daily</option>
                <option value="Every 8 hours">Every 8 hours</option>
                <option value="As needed (SOS)">As needed (SOS)</option>
                <option value="Weekly">Weekly</option>
              </select>
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="med-status">Status</label>
              <select
                id="med-status"
                className="input-field"
                value={medForm.status}
                onChange={e => setMedForm({ ...medForm, status: e.target.value as MedicationStatus })}
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
                <option value="discontinued">Discontinued</option>
              </select>
            </div>
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="med-instructions">Instructions</label>
            <input
              id="med-instructions"
              type="text"
              className="input-field"
              placeholder="e.g. After breakfast and dinner, with water"
              value={medForm.instructions}
              onChange={e => setMedForm({ ...medForm, instructions: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="input-group">
              <label className="input-label" htmlFor="med-start">Start Date</label>
              <input
                id="med-start"
                type="date"
                className="input-field"
                value={medForm.start_date}
                onChange={e => setMedForm({ ...medForm, start_date: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="med-end">End Date (optional)</label>
              <input
                id="med-end"
                type="date"
                className="input-field"
                value={medForm.end_date}
                onChange={e => setMedForm({ ...medForm, end_date: e.target.value })}
              />
            </div>
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="med-notes">Notes</label>
            <textarea
              id="med-notes"
              className="input-field"
              rows={2}
              placeholder="Prescribing doctor or additional notes"
              value={medForm.notes}
              onChange={e => setMedForm({ ...medForm, notes: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--color-border-light)]">
            <button
              type="button"
              onClick={() => setMedModalOpen(false)}
              className="btn btn-outline"
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {editingMed ? 'Save Changes' : 'Add Medication'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Allergy Add/Edit Modal */}
      <Modal
        isOpen={algModalOpen}
        onClose={() => setAlgModalOpen(false)}
        title={editingAlg ? 'Edit Known Allergy' : 'Add Known Allergy'}
        size="md"
      >
        <form onSubmit={handleAlgSubmit} className="space-y-4">
          <div className="input-group">
            <label className="input-label" htmlFor="alg-allergen">Allergen Name *</label>
            <input
              id="alg-allergen"
              type="text"
              required
              className="input-field"
              placeholder="e.g. Penicillin, Peanuts, Dust mites, Sulfa drugs"
              value={algForm.allergen}
              onChange={e => setAlgForm({ ...algForm, allergen: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="input-group">
              <label className="input-label" htmlFor="alg-cat">Category / Source</label>
              <select
                id="alg-cat"
                className="input-field"
                value={algForm.source}
                onChange={e => setAlgForm({ ...algForm, source: e.target.value })}
              >
                <option value="Medication">Medication</option>
                <option value="Food">Food</option>
                <option value="Environmental">Environmental</option>
                <option value="Insect / Animal">Insect / Animal</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="alg-sev">Severity</label>
              <select
                id="alg-sev"
                className="input-field"
                value={algForm.severity}
                onChange={e => setAlgForm({ ...algForm, severity: e.target.value as AllergySeverity })}
              >
                <option value="mild">Mild</option>
                <option value="moderate">Moderate</option>
                <option value="severe">Severe</option>
                <option value="life-threatening">Life-threatening</option>
              </select>
            </div>
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="alg-reaction">Reaction Symptoms</label>
            <input
              id="alg-reaction"
              type="text"
              className="input-field"
              placeholder="e.g. Hives and breathing difficulty, skin rash, swelling"
              value={algForm.reaction}
              onChange={e => setAlgForm({ ...algForm, reaction: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="input-group">
              <label className="input-label" htmlFor="alg-status">Verification Status</label>
              <select
                id="alg-status"
                className="input-field"
                value={algForm.verification_status}
                onChange={e => setAlgForm({ ...algForm, verification_status: e.target.value as VerificationStatus })}
              >
                <option value="patient-reported">Patient-reported</option>
                <option value="clinician-confirmed">Clinician-confirmed</option>
                <option value="unverified">Unverified</option>
              </select>
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="alg-date">Date First Noted</label>
              <input
                id="alg-date"
                type="date"
                className="input-field"
                value={algForm.first_noted_at}
                onChange={e => setAlgForm({ ...algForm, first_noted_at: e.target.value })}
              />
            </div>
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="alg-notes">Clinical Notes</label>
            <textarea
              id="alg-notes"
              className="input-field"
              rows={2}
              placeholder="Specific reaction history or precautions"
              value={algForm.notes}
              onChange={e => setAlgForm({ ...algForm, notes: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--color-border-light)]">
            <button
              type="button"
              onClick={() => setAlgModalOpen(false)}
              className="btn btn-outline"
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {editingAlg ? 'Save Changes' : 'Add Allergy'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Data Quality Cleanup Modal */}
      <Modal
        isOpen={cleanupModalOpen}
        onClose={() => setCleanupModalOpen(false)}
        title={`Data Quality Cleanup (${invalidRecords.length} Corrupted Records)`}
      >
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
            <p className="font-bold mb-1 flex items-center gap-1.5 text-amber-950 dark:text-amber-100">
              <AlertTriangle size={15} /> Clinical Evidence Validation Filter
            </p>
            <p>
              The items below were detected as non-clinical text fragments (sentence endings, document footers, appointment phrases, or calendar dates).
              Purging them is safe and will <strong>not</strong> affect genuine patient records such as Metformin, Pantoprazole, Sucralfate, Penicillin, or Ibuprofen.
            </p>
          </div>

          <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
            {invalidRecords.map(item => (
              <div
                key={item.id}
                className="p-3 rounded-xl border border-red-200 bg-red-50/50 dark:bg-red-950/20 dark:border-red-900 flex items-start justify-between gap-3 shadow-xs"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md tracking-wider ${
                      item.type === 'medication' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200' : 'bg-orange-100 text-orange-800 dark:bg-orange-900/60 dark:text-orange-200'
                    }`}>
                      {item.type}
                    </span>
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100 break-words">
                      "{item.displayName}"
                    </span>
                  </div>
                  <p className="text-xs text-red-700 dark:text-red-400">
                    Reason: {item.reason}
                  </p>
                  {item.details && (
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      {item.details}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (!user) return;
                    try {
                      if (item.type === 'medication') {
                        await deleteMedication(user.id, item.id);
                      } else {
                        await deleteAllergy(user.id, item.id);
                      }
                      showToast('success', `Removed corrupted entry: "${item.displayName}"`);
                      await loadData();
                    } catch (e) {
                      showToast('error', 'Failed to remove entry');
                    }
                  }}
                  className="p-1.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-lg transition-colors shrink-0"
                  title="Delete this corrupted entry"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--color-border-light)]">
            <button
              type="button"
              onClick={() => setCleanupModalOpen(false)}
              className="btn btn-outline btn-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={cleaningUp || invalidRecords.length === 0}
              onClick={async () => {
                if (!user) return;
                setCleaningUp(true);
                try {
                  const res = await cleanupInvalidMedicalRecords(user.id);
                  showToast('success', `Cleaned up ${res.deletedMedicationsCount + res.deletedAllergiesCount} corrupted entries.`);
                  setCleanupModalOpen(false);
                  await loadData();
                } catch (e) {
                  showToast('error', 'Failed to execute cleanup');
                } finally {
                  setCleaningUp(false);
                }
              }}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Trash2 size={14} /> Remove All Corrupted Records
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDelete.open}
        title={`Delete ${confirmDelete.type === 'medication' ? 'Medication' : 'Allergy'}`}
        message={`Are you sure you want to remove "${confirmDelete.name}" from your health record? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setConfirmDelete(prev => ({ ...prev, open: false }))}
      />
    </div>
  );
}

