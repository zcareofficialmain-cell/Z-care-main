// ============================================================
// ZCare Digital Health Vault & Automatic Report Scanner
// ============================================================

import React, { useEffect, useState, useRef } from 'react';
import {
  FileText,
  Upload,
  Search,
  Download,
  Trash2,
  Calendar,
  Building,
  Sparkles,
  CheckCircle,
  FlaskConical,
  FolderLock,
  Cpu,
  RefreshCw,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Check,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  getMedicalDocuments,
  uploadMedicalDocument,
  updateDocumentMetadata,
  deleteMedicalDocument,
  getDocumentSignedUrl,
  getLabResults,
  deleteLabResult,
} from '@/services/api';
import { scanMedicalDocument, type ScanWorkflowResult } from '@/services/medicalReportScanner';
import { applyConfirmedExtraction } from '@/services/medicalProfileUpdater';
import ScanProgressIndicator from '@/components/medical-records/ScanProgressIndicator';
import ExtractionReviewPanel from '@/components/medical-records/ExtractionReviewPanel';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import type {
  MedicalDocument,
  DocumentUploadFormData,
  DocumentType,
} from '@/types';
import type {
  LabResult,
  ExtractionProgress,
  MatchedExtractionReview,
} from '@/types/medicalExtraction';
import { formatDate } from '@/utils';

export default function RecordsPage() {
  const { user, profile } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'documents' | 'lab_results'>('documents');
  const [documents, setDocuments] = useState<MedicalDocument[]>([]);
  const [labResults, setLabResults] = useState<LabResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');

  // Upload & Scanning Workflow State
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [workflowState, setWorkflowState] = useState<'form' | 'scanning' | 'reviewing'>('form');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [autoScanEnabled, setAutoScanEnabled] = useState(true);
  const [scanProgress, setScanProgress] = useState<ExtractionProgress>({
    step: 1,
    totalSteps: 6,
    label: 'Preparing report...',
    percentage: 5,
  });
  const [scanResult, setScanResult] = useState<ScanWorkflowResult | null>(null);
  const [currentUploadedDoc, setCurrentUploadedDoc] = useState<MedicalDocument | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [docForm, setDocForm] = useState<DocumentUploadFormData>({
    title: '',
    document_type: 'report',
    hospital_name: '',
    document_date: new Date().toISOString().split('T')[0],
    consultation_id: '',
    description: '',
  });

  // Delete dialogs
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    id: string;
    filePath: string;
    title: string;
  }>({
    open: false,
    id: '',
    filePath: '',
    title: '',
  });

  const [deleteLabConfirm, setDeleteLabConfirm] = useState<{
    open: boolean;
    id: string;
    name: string;
  }>({
    open: false,
    id: '',
    name: '',
  });

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [docs, labs] = await Promise.all([
        getMedicalDocuments(user.id),
        getLabResults(user.id),
      ]);
      setDocuments(docs);
      setLabResults(labs);
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to load medical records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    const cleanTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');

    let docType: DocumentType = 'report';
    const lower = file.name.toLowerCase();
    if (lower.includes('rx') || lower.includes('prescription')) docType = 'prescription';
    else if (lower.includes('blood') || lower.includes('lab') || lower.includes('cbc') || lower.includes('panel')) docType = 'lab-result';
    else if (lower.includes('ecg') || lower.includes('xray') || lower.includes('mri') || lower.includes('ct')) docType = 'imaging';
    else if (lower.includes('discharge')) docType = 'discharge-summary';

    setDocForm(prev => ({
      ...prev,
      title: cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1),
      document_type: docType,
    }));
  };

  // Start upload & automatic scan
  const handleUploadAndScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedFile || !docForm.title.trim()) return;

    try {
      // 1. Upload original document
      setWorkflowState('scanning');
      setScanError(null);
      abortControllerRef.current = new AbortController();

      const newDoc = await uploadMedicalDocument(user.id, selectedFile, docForm);
      setCurrentUploadedDoc(newDoc);

      if (!autoScanEnabled) {
        showToast('success', 'Document saved to Health Vault');
        handleCloseModal();
        loadData();
        return;
      }

      // 2. Run Automatic Document Scanning Pipeline
      const result = await scanMedicalDocument(
        user.id,
        selectedFile,
        newDoc,
        progress => setScanProgress(progress),
        abortControllerRef.current.signal
      );

      // Attach patient_info to reviewData for profile updating
      (result.review as any).patient_info = result.extraction.patient_info;

      // Update document metadata with verified extracted hospital name and report date
      if (result.extraction.patient_info?.hospital_name || result.extraction.patient_info?.report_date) {
        try {
          const updatedDoc = await updateDocumentMetadata(user.id, newDoc.id, {
            hospital_name: result.extraction.patient_info.hospital_name || newDoc.hospital_name || undefined,
            document_date: result.extraction.patient_info.report_date || newDoc.document_date || undefined,
            document_type: result.extraction.document_type || newDoc.document_type,
          });
          setCurrentUploadedDoc(updatedDoc);
        } catch {
          // non-fatal
        }
      }

      setScanResult(result);

      // If items detected, open review interface
      if (result.review.summary.totalItems > 0) {
        setWorkflowState('reviewing');
        showToast('info', `Identified ${result.review.summary.totalItems} medical details for review`);
      } else {
        if (!result.extraction.raw_text || result.extraction.raw_text.trim().length === 0) {
          showToast('error', 'Extraction failed: Could not read text layers from document.');
        } else {
          showToast('success', 'Document saved to vault. No additional medications or lab tests detected.');
        }
        handleCloseModal();
        loadData();
      }
    } catch (err: any) {
      if (err.message?.includes('cancelled')) {
        showToast('info', 'Document scan cancelled');
        handleCloseModal();
      } else {
        console.error('Scan error:', err);
        setScanError(err.message || 'Failed to complete automatic document scanning.');
      }
    }
  };

  // Scan an existing document in the vault
  const handleScanExistingDoc = async (doc: MedicalDocument) => {
    if (!user) return;
    try {
      showToast('info', `Starting scanner for ${doc.title}...`);
      setUploadModalOpen(true);
      setWorkflowState('scanning');
      setScanError(null);
      setCurrentUploadedDoc(doc);
      abortControllerRef.current = new AbortController();

      // Fetch document blob
      const signedUrl = await getDocumentSignedUrl(doc.file_path);
      const res = await fetch(signedUrl);
      const blob = await res.blob();
      const file = new File([blob], doc.file_name || `${doc.title}.pdf`, { type: doc.file_type || 'application/pdf' });

      const result = await scanMedicalDocument(
        user.id,
        file,
        doc,
        progress => setScanProgress(progress),
        abortControllerRef.current.signal
      );

      // Attach patient_info to reviewData for profile updating
      (result.review as any).patient_info = result.extraction.patient_info;

      // Update document metadata if hospital name or date was refreshed
      if (result.extraction.patient_info?.hospital_name || result.extraction.patient_info?.report_date) {
        try {
          const updated = await updateDocumentMetadata(user.id, doc.id, {
            hospital_name: result.extraction.patient_info.hospital_name || doc.hospital_name || undefined,
            document_date: result.extraction.patient_info.report_date || doc.document_date || undefined,
          });
          setCurrentUploadedDoc(updated);
        } catch {
          // non-fatal
        }
      }

      setScanResult(result);
      if (result.review.summary.totalItems > 0) {
        setWorkflowState('reviewing');
      } else {
        if (!result.extraction.raw_text || result.extraction.raw_text.trim().length === 0) {
          showToast('error', 'Could not read document contents. File may be unreadable or corrupt.');
        } else {
          showToast('info', 'Scan complete. No new clinical details found.');
        }
        handleCloseModal();
      }
    } catch (err: any) {
      console.error(err);
      setScanError(err.message || 'Failed to scan existing document.');
    }
  };

  // Confirm updates from review panel
  const handleConfirmUpdates = async (reviewData: MatchedExtractionReview) => {
    if (!user || !currentUploadedDoc) return;
    setIsApplying(true);

    try {
      const applyResult = await applyConfirmedExtraction(
        user.id,
        currentUploadedDoc,
        scanResult?.extractionRecord?.id || null,
        reviewData
      );

      const itemsCreated =
        applyResult.medications_created +
        applyResult.allergies_created +
        applyResult.consultations_created +
        applyResult.lab_results_created +
        applyResult.reminders_created;

      showToast(
        'success',
        `Profile updated! Added ${itemsCreated} confirmed health records.`
      );

      handleCloseModal();
      loadData();
    } catch (err: any) {
      console.error('Failed to apply extraction:', err);
      showToast('error', 'Failed to commit health profile updates.');
    } finally {
      setIsApplying(false);
    }
  };

  // Close modal and reset state
  const handleCloseModal = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setUploadModalOpen(false);
    setWorkflowState('form');
    setSelectedFile(null);
    setScanResult(null);
    setCurrentUploadedDoc(null);
    setScanError(null);
    setIsApplying(false);
    setDocForm({
      title: '',
      document_type: 'report',
      hospital_name: '',
      document_date: new Date().toISOString().split('T')[0],
      consultation_id: '',
      description: '',
    });
  };

  const handleDelete = async () => {
    if (!user) return;
    try {
      await deleteMedicalDocument(user.id, deleteConfirm.id, deleteConfirm.filePath);
      showToast('success', 'Document removed');
      setDeleteConfirm(prev => ({ ...prev, open: false }));
      loadData();
    } catch (err) {
      showToast('error', 'Failed to delete document');
    }
  };

  const handleDeleteLabResult = async () => {
    if (!user) return;
    try {
      await deleteLabResult(user.id, deleteLabConfirm.id);
      showToast('success', 'Lab test removed');
      setDeleteLabConfirm(prev => ({ ...prev, open: false }));
      loadData();
    } catch (err) {
      showToast('error', 'Failed to delete lab result');
    }
  };

  const handleDownload = async (doc: MedicalDocument) => {
    try {
      const url = await getDocumentSignedUrl(doc.file_path);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.file_name || doc.title;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      showToast('error', 'Failed to generate download URL');
    }
  };

  const filteredDocs = documents.filter(d => {
    const matchesSearch =
      d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (d.hospital_name && d.hospital_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (d.description && d.description.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesType = selectedType === 'all' || d.document_type === selectedType;
    return matchesSearch && matchesType;
  });

  const filteredLabs = labResults.filter(l =>
    l.test_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (l.source_hospital && l.source_hospital.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (l.result_value && l.result_value.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--color-emerald-primary)' }}>
            DIGITAL HEALTH VAULT & AUTO-SCANNER
          </span>
          <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
            Medical records & reports
          </h1>
          <p className="text-sm md:text-base mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Upload medical reports to automatically scan, extract structured clinical data, and update your health profile.
          </p>
        </div>

        <button
          onClick={() => {
            setWorkflowState('form');
            setUploadModalOpen(true);
          }}
          className="btn btn-primary flex items-center gap-1.5 shadow-xs"
        >
          <Upload size={16} />
          + Upload & Scan Report
        </button>
      </div>

      {/* Tabs: Stored Documents vs Structured Lab Results */}
      <div className="flex items-center gap-4 border-b border-[var(--color-border)] mb-6">
        <button
          onClick={() => setActiveTab('documents')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'documents'
              ? 'border-[var(--color-emerald-primary)] text-[var(--color-emerald-primary)]'
              : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
          }`}
        >
          <FolderLock size={16} />
          <span>Documents & Files ({documents.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('lab_results')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'lab_results'
              ? 'border-[var(--color-emerald-primary)] text-[var(--color-emerald-primary)]'
              : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
          }`}
        >
          <FlaskConical size={16} />
          <span>Extracted Lab Tests ({labResults.length})</span>
        </button>
      </div>

      {/* Search and Filters */}
      <div className="card p-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-light)]" />
          <input
            type="text"
            placeholder={activeTab === 'documents' ? "Search reports by title, hospital..." : "Search tests (e.g. HbA1c, glucose)..."}
            className="input-field text-xs"
            style={{ paddingLeft: 34 }}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        {activeTab === 'documents' && (
          <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto">
            {['all', 'report', 'prescription', 'lab-result', 'imaging', 'discharge-summary'].map(type => (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize whitespace-nowrap transition-colors ${
                  selectedType === type
                    ? 'bg-[var(--color-emerald-primary)] text-white'
                    : 'bg-[var(--color-bg-page)] text-[var(--color-text-muted)] hover:bg-[var(--color-mint-soft)]'
                }`}
              >
                {type === 'all' ? 'All Records' : type.replace('-', ' ')}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* TAB 1: Documents Grid */}
      {activeTab === 'documents' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredDocs.map(doc => (
              <div
                key={doc.id}
                className="card card-hover p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <span className="badge badge-neutral text-[10px] font-bold uppercase tracking-wider">
                      {doc.document_type}
                    </span>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleScanExistingDoc(doc)}
                        className="btn-icon btn-ghost p-1 text-xs hover:text-[var(--color-emerald-primary)]"
                        title="Scan & extract medical information"
                      >
                        <Cpu size={14} />
                      </button>
                      <button
                        onClick={() => handleDownload(doc)}
                        className="btn-icon btn-ghost p-1 text-xs"
                        title="Download file"
                      >
                        <Download size={14} />
                      </button>
                      <button
                        onClick={() =>
                          setDeleteConfirm({
                            open: true,
                            id: doc.id,
                            filePath: doc.file_path,
                            title: doc.title,
                          })
                        }
                        className="btn-icon btn-ghost p-1 text-xs hover:text-red-600"
                        title="Delete document"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 mb-2">
                    <div
                      className="p-2 rounded-xl shrink-0"
                      style={{ backgroundColor: 'var(--color-mint-soft)', color: 'var(--color-emerald-primary)' }}
                    >
                      <FileText size={18} />
                    </div>
                    <h3 className="font-bold text-sm leading-snug text-[var(--color-text-primary)]">
                      {doc.title}
                    </h3>
                  </div>

                  {doc.hospital_name && (
                    <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-light)] mb-1">
                      <Building size={12} />
                      <span>{doc.hospital_name}</span>
                    </div>
                  )}

                  {doc.document_date && (
                    <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-light)] mb-2">
                      <Calendar size={12} />
                      <span>{formatDate(doc.document_date)}</span>
                    </div>
                  )}

                  {doc.description && (
                    <p className="text-xs p-2 rounded-lg bg-[var(--color-bg-page)] text-[var(--color-text-muted)] line-clamp-2">
                      {doc.description}
                    </p>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-[var(--color-border-light)] flex items-center justify-between text-xs">
                  <button
                    onClick={() => handleScanExistingDoc(doc)}
                    className="text-[11px] font-semibold text-[var(--color-emerald-primary)] hover:underline flex items-center gap-1"
                  >
                    <Sparkles size={12} /> Auto-Scan Report
                  </button>
                  <button
                    onClick={() => handleDownload(doc)}
                    className="font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] flex items-center gap-1"
                  >
                    Download <Download size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {filteredDocs.length === 0 && !loading && (
            <div className="card p-12 text-center max-w-md mx-auto my-8 border-dashed border-[var(--color-border)]">
              <FileText size={40} className="mx-auto mb-3 opacity-30 text-[var(--color-emerald-primary)]" />
              <h3 className="text-base font-bold mb-1">No medical records found</h3>
              <p className="text-xs mb-4 text-[var(--color-text-muted)]">
                Upload your lab test reports, prescription scans, or medical summaries for automatic scanning.
              </p>
              <button
                onClick={() => {
                  setWorkflowState('form');
                  setUploadModalOpen(true);
                }}
                className="btn btn-primary btn-sm"
              >
                <Upload size={14} /> Upload & Scan Report
              </button>
            </div>
          )}
        </>
      )}

      {/* TAB 2: Structured Lab Results Table */}
      {activeTab === 'lab_results' && (
        <div className="card overflow-hidden border border-[var(--color-border)]">
          <div className="p-4 bg-[var(--color-mint-soft)]/50 border-b border-[var(--color-border)] flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-[var(--color-teal-deep)]">
                Confirmed Laboratory Results ({filteredLabs.length})
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                Extracted and verified parameters from your medical reports.
              </p>
            </div>
            <span className="badge badge-success text-xs">
              <ShieldCheck size={12} /> Traceable to Source
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[var(--color-bg-page)] text-[var(--color-text-muted)] font-semibold border-b border-[var(--color-border-light)] uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Test Name</th>
                  <th className="py-3 px-4">Result Value</th>
                  <th className="py-3 px-4">Reference Range</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Test Date</th>
                  <th className="py-3 px-4">Laboratory / Hospital</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-light)]">
                {filteredLabs.map(lab => (
                  <tr key={lab.id} className="hover:bg-[var(--color-mint-soft)]/20 transition-colors">
                    <td className="py-3 px-4 font-bold text-[var(--color-text-primary)]">
                      {lab.test_name}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-extrabold text-[var(--color-teal-deep)] text-sm">
                        {lab.result_value}
                      </span>{' '}
                      <span className="text-[var(--color-text-muted)]">{lab.unit || ''}</span>
                    </td>
                    <td className="py-3 px-4 text-[var(--color-text-muted)]">
                      {lab.reference_range || '—'}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`badge text-[10px] font-bold uppercase ${
                          lab.result_status === 'high'
                            ? 'badge-warning'
                            : lab.result_status === 'low'
                            ? 'badge-neutral'
                            : lab.result_status === 'critical'
                            ? 'badge-danger'
                            : 'badge-success'
                        }`}
                      >
                        {lab.result_status || 'normal'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[var(--color-text-muted)]">
                      {lab.test_date ? formatDate(lab.test_date) : '—'}
                    </td>
                    <td className="py-3 px-4 text-[var(--color-text-muted)]">
                      {lab.source_hospital || '—'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() =>
                          setDeleteLabConfirm({
                            open: true,
                            id: lab.id,
                            name: lab.test_name,
                          })
                        }
                        className="btn-icon btn-ghost p-1 text-xs hover:text-red-600"
                        title="Delete lab result"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredLabs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-[var(--color-text-muted)]">
                      No lab results extracted yet. Upload a blood report to automatically extract values.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Main Upload / Scanning / Review Modal */}
      <Modal
        isOpen={uploadModalOpen}
        onClose={handleCloseModal}
        title={
          workflowState === 'scanning'
            ? 'Scanning Medical Document...'
            : workflowState === 'reviewing'
            ? 'Review Detected Medical Information'
            : 'Upload & Scan Medical Report'
        }
        size={workflowState === 'reviewing' ? 'lg' : 'md'}
      >
        {/* Step 1: Upload Form */}
        {workflowState === 'form' && (
          <form onSubmit={handleUploadAndScan} className="space-y-4">
            <div className="border-2 border-dashed border-[var(--color-border)] rounded-xl p-5 text-center bg-[var(--color-bg-page)]">
              <Upload size={28} className="mx-auto mb-2 opacity-50 text-[var(--color-emerald-primary)]" />
              <p className="text-xs font-semibold mb-1 text-[var(--color-text-primary)]">
                Choose a PDF, JPEG, or PNG file
              </p>
              <p className="text-[11px] mb-3 text-[var(--color-text-muted)]">
                Supported: Lab tests, prescriptions, doctor consultations, discharge summaries, and vaccine records.
              </p>
              <input
                type="file"
                accept=".pdf,image/png,image/jpeg"
                onChange={handleFileChange}
                className="text-xs"
              />
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="doc-upload-title">Document Title *</label>
              <input
                id="doc-upload-title"
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
                <label className="input-label" htmlFor="doc-upload-type">Document Category</label>
                <select
                  id="doc-upload-type"
                  className="input-field"
                  value={docForm.document_type}
                  onChange={e => setDocForm({ ...docForm, document_type: e.target.value as DocumentType })}
                >
                  <option value="report">Medical Report</option>
                  <option value="prescription">Prescription</option>
                  <option value="lab-result">Laboratory Test</option>
                  <option value="imaging">Imaging (X-ray / CT / ECG)</option>
                  <option value="discharge-summary">Discharge Summary</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="input-group">
                <label className="input-label" htmlFor="doc-upload-date">Report Date</label>
                <input
                  id="doc-upload-date"
                  type="date"
                  className="input-field"
                  value={docForm.document_date}
                  onChange={e => setDocForm({ ...docForm, document_date: e.target.value })}
                />
              </div>
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="doc-upload-hosp">Hospital / Laboratory</label>
              <input
                id="doc-upload-hosp"
                type="text"
                className="input-field"
                placeholder="e.g. City Care Hospital"
                value={docForm.hospital_name}
                onChange={e => setDocForm({ ...docForm, hospital_name: e.target.value })}
              />
            </div>

            {/* Auto-scan switch */}
            <div className="p-3.5 rounded-xl bg-[var(--color-mint-soft)] border border-[var(--color-border)] flex items-start gap-3">
              <input
                id="auto-scan-checkbox"
                type="checkbox"
                checked={autoScanEnabled}
                onChange={e => setAutoScanEnabled(e.target.checked)}
                className="mt-0.5 accent-[var(--color-emerald-primary)] rounded"
              />
              <label htmlFor="auto-scan-checkbox" className="text-xs cursor-pointer">
                <span className="font-bold text-[var(--color-teal-deep)] block">
                  Automatically scan report & identify clinical data
                </span>
                <span className="text-[var(--color-text-muted)] text-[11px] block mt-0.5">
                  Reads medications, lab tests, allergies, and appointments using client-side OCR and text extraction. You can review all items before updating your profile.
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-[var(--color-border-light)]">
              <button
                type="button"
                onClick={handleCloseModal}
                className="btn btn-outline text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!selectedFile}
                className="btn btn-primary text-xs flex items-center gap-1.5"
              >
                <Sparkles size={14} />
                {autoScanEnabled ? 'Upload & Scan Report' : 'Save Document Only'}
              </button>
            </div>
          </form>
        )}

        {/* Step 2: Scanning Progress Indicator */}
        {workflowState === 'scanning' && (
          <div className="py-4">
            <ScanProgressIndicator
              progress={scanProgress}
              fileName={selectedFile?.name || currentUploadedDoc?.file_name || 'Report'}
              error={scanError}
              onCancel={handleCloseModal}
              onRetry={() => {
                if (currentUploadedDoc) {
                  handleScanExistingDoc(currentUploadedDoc);
                }
              }}
            />
          </div>
        )}

        {/* Step 3: Extracted Information Review Screen */}
        {workflowState === 'reviewing' && scanResult && currentUploadedDoc && (
          <ExtractionReviewPanel
            document={currentUploadedDoc}
            extraction={scanResult.extraction}
            initialReview={scanResult.review}
            userProfile={profile}
            onConfirmUpdates={handleConfirmUpdates}
            onSaveDocumentOnly={() => {
              showToast('success', 'Document preserved in Health Vault');
              handleCloseModal();
              loadData();
            }}
            onCancel={handleCloseModal}
            isApplying={isApplying}
          />
        )}
      </Modal>

      {/* Delete Document Confirmation */}
      <ConfirmDialog
        isOpen={deleteConfirm.open}
        title="Delete Medical Document"
        message={`Are you sure you want to delete "${deleteConfirm.title}" from your private storage?`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(prev => ({ ...prev, open: false }))}
      />

      {/* Delete Lab Result Confirmation */}
      <ConfirmDialog
        isOpen={deleteLabConfirm.open}
        title="Delete Laboratory Result"
        message={`Are you sure you want to delete "${deleteLabConfirm.name}" from your records?`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteLabResult}
        onCancel={() => setDeleteLabConfirm(prev => ({ ...prev, open: false }))}
      />
    </div>
  );
}
