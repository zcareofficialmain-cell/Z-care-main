import { useEffect, useState } from 'react';
import { useStartAction } from '@/hooks/useStartAction';
import {
  Stethoscope,
  FileText,
  Upload,
  Plus,
  Calendar,
  Clock,
  Edit2,
  Trash2,
  Paperclip,
  CheckCircle,
  FileCheck,
  Search,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  getConsultations,
  createConsultation,
  updateConsultation,
  deleteConsultation,
  getMedicalDocuments,
  uploadMedicalDocument,
} from '@/services/api';
import { processMedicalFile, type ExtractedDocumentData } from '@/services/documentExtractor';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import type {
  Consultation,
  ConsultationFormData,
  MedicalDocument,
  DocumentUploadFormData,
  DocumentType,
} from '@/types';
import { formatDate } from '@/utils';

export default function ConsultationsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [documents, setDocuments] = useState<MedicalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Consultation Modal State
  const [conModalOpen, setConModalOpen] = useState(false);
  const [editingCon, setEditingCon] = useState<Consultation | null>(null);
  const [conForm, setConForm] = useState<ConsultationFormData>({
    doctor_name: '',
    specialty: '',
    hospital_name: '',
    consultation_date: new Date().toISOString().split('T')[0],
    reason: '',
    notes: '',
    follow_up_date: '',
  });

  // Document Upload Modal State (with Client-Side Text Extraction / OCR)
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractionStatus, setExtractionStatus] = useState('');
  const [extractedData, setExtractedData] = useState<ExtractedDocumentData | null>(null);
  const [docForm, setDocForm] = useState<DocumentUploadFormData>({
    title: '',
    document_type: 'report',
    hospital_name: '',
    document_date: new Date().toISOString().split('T')[0],
    consultation_id: '',
    description: '',
  });

  // Delete Confirm Dialog
  const [confirmDeleteCon, setConfirmDeleteCon] = useState<{
    open: boolean;
    id: string;
    doctor: string;
  }>({
    open: false,
    id: '',
    doctor: '',
  });

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [cons, docs] = await Promise.all([
        getConsultations(user.id),
        getMedicalDocuments(user.id),
      ]);
      setConsultations(cons);
      setDocuments(docs);
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to load consultation history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  // Handle Consultation Submit
  const handleConSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !conForm.doctor_name.trim()) return;

    try {
      if (editingCon) {
        await updateConsultation(user.id, editingCon.id, conForm);
        showToast('success', 'Consultation updated');
      } else {
        await createConsultation(user.id, conForm);
        showToast('success', 'Consultation logged in your care timeline');
      }
      setConModalOpen(false);
      setEditingCon(null);
      loadData();
    } catch (err) {
      showToast('error', 'Failed to save consultation');
    }
  };

  const openConModal = (con?: Consultation) => {
    if (con) {
      setEditingCon(con);
      setConForm({
        doctor_name: con.doctor_name,
        specialty: con.specialty || '',
        hospital_name: con.hospital_name || '',
        consultation_date: con.consultation_date,
        reason: con.reason || '',
        notes: con.notes || '',
        follow_up_date: con.follow_up_date || '',
      });
    } else {
      setEditingCon(null);
      setConForm({
        doctor_name: '',
        specialty: '',
        hospital_name: '',
        consultation_date: new Date().toISOString().split('T')[0],
        reason: '',
        notes: '',
        follow_up_date: '',
      });
    }
    setConModalOpen(true);
  };

  // Welcome modal "Add Doctor History" → the existing Log Doctor Consultation modal.
  useStartAction('new', conModalOpen, () => openConModal());

  const handleDeleteCon = async () => {
    if (!user) return;
    try {
      await deleteConsultation(user.id, confirmDeleteCon.id);
      showToast('success', 'Consultation removed');
      setConfirmDeleteCon(prev => ({ ...prev, open: false }));
      loadData();
    } catch (err) {
      showToast('error', 'Failed to delete consultation');
    }
  };

  // Handle File Selection with Client-Side Extraction / OCR
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setExtracting(true);
    setExtractionStatus('Processing document...');

    try {
      const parsed = await processMedicalFile(file, status => {
        setExtractionStatus(status);
      });

      setExtractedData(parsed);
      setDocForm({
        title: parsed.title || file.name.replace(/\.[^/.]+$/, ''),
        document_type: parsed.document_type || 'report',
        hospital_name: parsed.hospital_name || '',
        document_date: parsed.document_date || new Date().toISOString().split('T')[0],
        consultation_id: '',
        description: parsed.medications && parsed.medications.length > 0
          ? `Detected medications: ${parsed.medications.join(', ')}`
          : '',
      });
      showToast('info', `Metadata extracted via client-side ${parsed.method}`);
    } catch (err) {
      console.warn('Extraction notice:', err);
      setDocForm(prev => ({
        ...prev,
        title: file.name.replace(/\.[^/.]+$/, ''),
      }));
    } finally {
      setExtracting(false);
      setExtractionStatus('');
    }
  };

  // Upload Medical Document Submit
  const handleDocSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedFile || !docForm.title.trim()) return;

    try {
      await uploadMedicalDocument(user.id, selectedFile, docForm);
      showToast('success', 'Medical document saved successfully');
      setUploadModalOpen(false);
      setSelectedFile(null);
      setExtractedData(null);
      loadData();
    } catch (err) {
      showToast('error', 'Failed to save document');
    }
  };

  const reportsCount = documents.filter(d => d.document_type === 'report' || d.document_type === 'lab-result' || d.document_type === 'imaging').length;
  const prescriptionsCount = documents.filter(d => d.document_type === 'prescription').length;

  const filteredConsultations = consultations.filter(c => {
    const q = searchQuery.toLowerCase();
    return (
      c.doctor_name.toLowerCase().includes(q) ||
      (c.specialty && c.specialty.toLowerCase().includes(q)) ||
      (c.hospital_name && c.hospital_name.toLowerCase().includes(q)) ||
      (c.reason && c.reason.toLowerCase().includes(q))
    );
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Screen 7 Header matching reference */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--color-emerald-primary)' }}>
            YOUR COVERAGE & CARE
          </span>
          <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
            Doctor consultation history
          </h1>
          <p className="text-sm md:text-base mt-1" style={{ color: 'var(--color-text-muted)' }}>
            In this section, find a complete history and detailed info about documents related to your care.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setUploadModalOpen(true)}
            className="btn btn-primary flex items-center gap-1.5"
          >
            <Upload size={16} />
            + Upload more
          </button>
          <button
            onClick={() => openConModal()}
            className="btn btn-outline flex items-center gap-1.5"
          >
            <Plus size={16} />
            Log Visit
          </button>
        </div>
      </div>

      {/* Stat Count Pills matching reference image: 1 Consultation, 2 Reports, 3 Prescriptions */}
      <div className="grid grid-cols-3 gap-3 md:gap-6 mb-8 max-w-2xl">
        <div className="card p-4 text-center border-b-4 border-b-[var(--color-emerald-primary)]">
          <div className="text-2xl md:text-3xl font-extrabold" style={{ color: 'var(--color-teal-deep)' }}>
            {consultations.length}
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider mt-1 block" style={{ color: 'var(--color-text-muted)' }}>
            Consultation{consultations.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="card p-4 text-center border-b-4 border-b-blue-600">
          <div className="text-2xl md:text-3xl font-extrabold text-blue-900">
            {reportsCount}
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider mt-1 block" style={{ color: 'var(--color-text-muted)' }}>
            Report{reportsCount !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="card p-4 text-center border-b-4 border-b-amber-600">
          <div className="text-2xl md:text-3xl font-extrabold text-amber-900">
            {prescriptionsCount}
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider mt-1 block" style={{ color: 'var(--color-text-muted)' }}>
            Prescription{prescriptionsCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Care Timeline Section matching reference */}
      <div className="card p-6 md:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
              Your care timeline
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              View and track your medical journey
            </p>
          </div>

          {/* Search box */}
          <div className="relative max-w-xs w-full">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-light)' }} />
            <input
              type="text"
              placeholder="Search doctors, hospitals..."
              className="input-field text-xs"
              style={{ paddingLeft: 34 }}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Timeline Items */}
        <div className="space-y-6">
          {filteredConsultations.map(con => {
            const attachedDocs = documents.filter(d => d.consultation_id === con.id);
            return (
              <div
                key={con.id}
                className="flex flex-col sm:flex-row items-start gap-4 p-5 rounded-2xl border border-[var(--color-border-light)] hover:border-[var(--color-emerald-primary)] transition-all bg-white"
              >
                {/* Date Badge on Left */}
                <div className="sm:w-32 shrink-0">
                  <div
                    className="inline-block px-3 py-1.5 rounded-lg text-xs font-bold"
                    style={{ backgroundColor: 'var(--color-mint-soft)', color: 'var(--color-emerald-primary)' }}
                  >
                    {formatDate(con.consultation_date)}
                  </div>
                </div>

                {/* Main Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <div
                          className="p-1.5 rounded-lg shrink-0"
                          style={{ backgroundColor: 'var(--color-mint-lighter)', color: 'var(--color-emerald-primary)' }}
                        >
                          <Stethoscope size={16} />
                        </div>
                        <h3 className="font-bold text-base" style={{ color: 'var(--color-text-primary)' }}>
                          {con.doctor_name}
                        </h3>
                        {con.specialty && (
                          <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
                            ({con.specialty})
                          </span>
                        )}
                      </div>

                      <p className="text-xs font-semibold mt-1" style={{ color: 'var(--color-teal-deep)' }}>
                        Consultation — {con.reason || 'Routine checkup'}
                      </p>

                      <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-light)' }}>
                        {con.hospital_name || 'Hospital / Clinic'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => openConModal(con)}
                        className="btn-icon btn-ghost p-1 text-xs"
                        title="Edit consultation"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() =>
                          setConfirmDeleteCon({
                            open: true,
                            id: con.id,
                            doctor: con.doctor_name,
                          })
                        }
                        className="btn-icon btn-ghost p-1 text-xs hover:text-red-600"
                        title="Delete consultation"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {con.notes && (
                    <div className="mt-3 p-3 rounded-lg text-xs bg-[var(--color-bg-page)] text-[var(--color-text-primary)]">
                      <strong>Notes:</strong> {con.notes}
                    </div>
                  )}

                  {con.follow_up_date && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--color-warning)' }}>
                      <Calendar size={13} />
                      Follow-up recommended on {formatDate(con.follow_up_date)}
                    </div>
                  )}

                  {/* Attached Documents */}
                  {attachedDocs.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-[var(--color-border-light)] flex flex-wrap gap-2">
                      {attachedDocs.map(doc => (
                        <div
                          key={doc.id}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border"
                          style={{
                            backgroundColor: 'var(--color-mint-lighter)',
                            borderColor: 'var(--color-border)',
                            color: 'var(--color-teal-deep)',
                          }}
                        >
                          <Paperclip size={12} />
                          <span className="truncate max-w-[160px]">{doc.title}</span>
                          <span className="text-[10px] opacity-70 uppercase">({doc.document_type})</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {filteredConsultations.length === 0 && !loading && (
            <div className="text-center py-12 border-dashed border rounded-xl border-[var(--color-border)]">
              <Stethoscope size={36} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>
                {searchQuery ? 'No matching doctor visits found.' : 'No consultations recorded yet.'}
              </p>
              <button
                onClick={() => openConModal()}
                className="btn btn-outline btn-sm mt-3"
              >
                <Plus size={14} /> Log First Consultation
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Consultation Add/Edit Modal */}
      <Modal
        isOpen={conModalOpen}
        onClose={() => setConModalOpen(false)}
        title={editingCon ? 'Edit Doctor Consultation' : 'Log Doctor Consultation'}
        size="md"
      >
        <form onSubmit={handleConSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="input-group">
              <label className="input-label" htmlFor="con-doc">Doctor Name *</label>
              <input
                id="con-doc"
                type="text"
                required
                className="input-field"
                placeholder="e.g. Dr. Amrutha Nair"
                value={conForm.doctor_name}
                onChange={e => setConForm({ ...conForm, doctor_name: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="con-spec">Specialty</label>
              <input
                id="con-spec"
                type="text"
                className="input-field"
                placeholder="e.g. General Physician, Dermatologist"
                value={conForm.specialty}
                onChange={e => setConForm({ ...conForm, specialty: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="input-group">
              <label className="input-label" htmlFor="con-hosp">Hospital / Clinic</label>
              <input
                id="con-hosp"
                type="text"
                className="input-field"
                placeholder="e.g. City Care Hospital"
                value={conForm.hospital_name}
                onChange={e => setConForm({ ...conForm, hospital_name: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="con-date">Consultation Date *</label>
              <input
                id="con-date"
                type="date"
                required
                className="input-field"
                value={conForm.consultation_date}
                onChange={e => setConForm({ ...conForm, consultation_date: e.target.value })}
              />
            </div>
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="con-reason">Reason for Visit</label>
            <input
              id="con-reason"
              type="text"
              className="input-field"
              placeholder="e.g. Routine checkup, Skin allergy, Blood pressure check"
              value={conForm.reason}
              onChange={e => setConForm({ ...conForm, reason: e.target.value })}
            />
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="con-notes">Doctor's Notes & Advice</label>
            <textarea
              id="con-notes"
              className="input-field"
              rows={3}
              placeholder="Advice given, diagnosis details, lifestyle recommendations"
              value={conForm.notes}
              onChange={e => setConForm({ ...conForm, notes: e.target.value })}
            />
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="con-follow">Follow-up Date (optional)</label>
            <input
              id="con-follow"
              type="date"
              className="input-field"
              value={conForm.follow_up_date}
              onChange={e => setConForm({ ...conForm, follow_up_date: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--color-border-light)]">
            <button
              type="button"
              onClick={() => setConModalOpen(false)}
              className="btn btn-outline"
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {editingCon ? 'Save Changes' : 'Log Consultation'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Document Upload & OCR / Extraction Modal */}
      <Modal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        title="Upload Medical Document / Report"
        size="md"
      >
        <form onSubmit={handleDocSubmit} className="space-y-4">
          <div className="border-2 border-dashed border-[var(--color-border)] rounded-xl p-5 text-center bg-[var(--color-bg-page)]">
            <Upload size={28} className="mx-auto mb-2 opacity-50" />
            <p className="text-xs font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>
              Choose a PDF, JPEG, or PNG medical document
            </p>
            <p className="text-[11px] mb-3" style={{ color: 'var(--color-text-muted)' }}>
              Client-side PDF.js text extraction and Tesseract OCR will assist in reading metadata.
            </p>
            <input
              type="file"
              accept=".pdf,image/png,image/jpeg"
              onChange={handleFileChange}
              className="text-xs"
            />
          </div>

          {extracting && (
            <div className="p-3 rounded-lg text-xs bg-[var(--color-mint-soft)] text-[var(--color-emerald-primary)] flex items-center gap-2">
              <span className="spinner spinner-sm" />
              <span>{extractionStatus || 'Extracting metadata from document...'}</span>
            </div>
          )}

          {extractedData && (
            <div className="p-3 rounded-lg text-xs bg-[var(--color-mint-lighter)] border border-[var(--color-border)]">
              <span className="font-bold block mb-1" style={{ color: 'var(--color-teal-deep)' }}>
                ✓ Client-side extraction complete ({extractedData.method})
              </span>
              <p className="text-[11px] opacity-80">
                Please review and adjust the extracted fields below before confirming.
              </p>
            </div>
          )}

          <div className="input-group">
            <label className="input-label" htmlFor="doc-title">Document Title *</label>
            <input
              id="doc-title"
              type="text"
              required
              className="input-field"
              placeholder="e.g. Complete Blood Count & Lipid Panel"
              value={docForm.title}
              onChange={e => setDocForm({ ...docForm, title: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="input-group">
              <label className="input-label" htmlFor="doc-type">Document Type</label>
              <select
                id="doc-type"
                className="input-field"
                value={docForm.document_type}
                onChange={e => setDocForm({ ...docForm, document_type: e.target.value as DocumentType })}
              >
                <option value="report">Medical Report</option>
                <option value="prescription">Prescription</option>
                <option value="lab-result">Lab Result</option>
                <option value="imaging">Imaging / X-Ray / ECG</option>
                <option value="discharge-summary">Discharge Summary</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="doc-date">Document Date</label>
              <input
                id="doc-date"
                type="date"
                className="input-field"
                value={docForm.document_date}
                onChange={e => setDocForm({ ...docForm, document_date: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="input-group">
              <label className="input-label" htmlFor="doc-hosp">Hospital / Lab Name</label>
              <input
                id="doc-hosp"
                type="text"
                className="input-field"
                placeholder="e.g. City Care Hospital"
                value={docForm.hospital_name}
                onChange={e => setDocForm({ ...docForm, hospital_name: e.target.value })}
              />
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="doc-con">Link to Consultation</label>
              <select
                id="doc-con"
                className="input-field"
                value={docForm.consultation_id}
                onChange={e => setDocForm({ ...docForm, consultation_id: e.target.value })}
              >
                <option value="">None (Independent record)</option>
                {consultations.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.doctor_name} ({formatDate(c.consultation_date)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="doc-desc">Summary Notes</label>
            <textarea
              id="doc-desc"
              className="input-field"
              rows={2}
              placeholder="Test results, doctor recommendations, or extracted findings"
              value={docForm.description}
              onChange={e => setDocForm({ ...docForm, description: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--color-border-light)]">
            <button
              type="button"
              onClick={() => setUploadModalOpen(false)}
              className="btn btn-outline"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedFile}
              className="btn btn-primary"
            >
              Confirm & Save Document
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Consultation Dialog */}
      <ConfirmDialog
        isOpen={confirmDeleteCon.open}
        title="Delete Consultation"
        message={`Are you sure you want to delete this consultation with ${confirmDeleteCon.doctor}?`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteCon}
        onCancel={() => setConfirmDeleteCon(prev => ({ ...prev, open: false }))}
      />
    </div>
  );
}

