// ============================================================
// ZCare Extraction Review Panel
// Dedicated interface for reviewing extracted medical data
// before committing updates to the user's health profile.
// ============================================================

import React, { useState } from 'react';
import {
  FileText,
  User,
  Stethoscope,
  Pill,
  AlertTriangle,
  FlaskConical,
  Calendar,
  Activity,
  Check,
  X,
  Edit2,
  CheckCircle,
  HelpCircle,
  ShieldCheck,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type {
  MedicalExtractionResult,
  MatchedExtractionReview,
  ReviewItem,
  ExtractionItemStatus,
  ExtractedMedication,
  ExtractedAllergy,
  ExtractedDoctorInfo,
  ExtractedLabResult,
  ExtractedFollowUp,
  ExtractedDiagnosis,
  ExtractedProcedure,
} from '@/types/medicalExtraction';
import type { MedicalDocument, Profile } from '@/types';

interface ExtractionReviewPanelProps {
  document: MedicalDocument;
  extraction: MedicalExtractionResult;
  initialReview: MatchedExtractionReview;
  userProfile?: Profile | null;
  onConfirmUpdates: (reviewData: MatchedExtractionReview) => Promise<void>;
  onSaveDocumentOnly: () => void;
  onCancel: () => void;
  isApplying?: boolean;
}

export default function ExtractionReviewPanel({
  document,
  extraction,
  initialReview,
  userProfile,
  onConfirmUpdates,
  onSaveDocumentOnly,
  onCancel,
  isApplying = false,
}: ExtractionReviewPanelProps) {
  const [review, setReview] = useState<MatchedExtractionReview>(initialReview);
  const [editingItem, setEditingItem] = useState<{ id: string; field: string; value: string } | null>(null);
  const [expandedSections, setExpandedSections] = useState({
    patient: true,
    doctors: true,
    medications: true,
    allergies: true,
    lab_results: true,
    diagnoses: true,
    follow_ups: true,
    procedures: true,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Status toggle handler
  const setItemStatus = <T,>(
    category: keyof Omit<MatchedExtractionReview, 'summary'>,
    id: string,
    status: ExtractionItemStatus
  ) => {
    setReview((prev: MatchedExtractionReview) => {
      const list = (prev[category] as ReviewItem<T>[]).map((item: ReviewItem<T>) =>
        item.id === id ? { ...item, status } : item
      );
      return { ...prev, [category]: list };
    });
  };

  // Accept all suitable (all non-duplicate and non-conflicting)
  const acceptAllSuitable = () => {
    setReview((prev: MatchedExtractionReview) => {
      const updateList = <T,>(list: ReviewItem<T>[]) =>
        list.map((item: ReviewItem<T>) => {
          if (item.match_info?.match_type === 'exact_duplicate') {
            return { ...item, status: 'rejected' as ExtractionItemStatus };
          }
          if (item.match_info?.match_type === 'conflict') {
            return item; // Keep as conflict for individual review
          }
          return { ...item, status: 'accepted' as ExtractionItemStatus };
        });

      return {
        ...prev,
        medications: updateList(prev.medications),
        allergies: updateList(prev.allergies),
        doctors: updateList(prev.doctors),
        lab_results: updateList(prev.lab_results),
        follow_ups: updateList(prev.follow_ups),
        diagnoses: updateList(prev.diagnoses),
        procedures: updateList(prev.procedures),
      };
    });
  };

  // Edit field value
  const handleSaveEdit = (
    category: keyof Omit<MatchedExtractionReview, 'summary'>,
    id: string,
    field: string,
    newValue: string
  ) => {
    setReview((prev: MatchedExtractionReview) => {
      const list = (prev[category] as ReviewItem<any>[]).map((item: ReviewItem<any>) => {
        if (item.id === id) {
          return {
            ...item,
            status: 'edited' as ExtractionItemStatus,
            edited_data: {
              ...(item.edited_data || {}),
              [field]: newValue,
            },
          };
        }
        return item;
      });
      return { ...prev, [category]: list };
    });
    setEditingItem(null);
  };

  // Count items ready for approval
  const approvedCount =
    review.medications.filter((m: ReviewItem<ExtractedMedication>) => m.status === 'accepted' || m.status === 'edited').length +
    review.allergies.filter((a: ReviewItem<ExtractedAllergy>) => a.status === 'accepted' || a.status === 'edited').length +
    review.doctors.filter((d: ReviewItem<ExtractedDoctorInfo>) => d.status === 'accepted' || d.status === 'edited').length +
    review.lab_results.filter((l: ReviewItem<ExtractedLabResult>) => l.status === 'accepted' || l.status === 'edited').length +
    review.follow_ups.filter((f: ReviewItem<ExtractedFollowUp>) => f.status === 'accepted' || f.status === 'edited').length;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header Banner */}
      <div className="card p-6 bg-white border border-[var(--color-border)] shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[var(--color-border-light)]">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--color-emerald-primary)' }}>
              REVIEW SUGGESTED UPDATES
            </span>
            <h2 className="text-xl md:text-2xl font-bold text-[var(--color-text-primary)]">
              Medical Information Detected
            </h2>
            <p className="text-xs md:text-sm text-[var(--color-text-muted)] mt-1">
              We've scanned your uploaded report and identified the following medical information. Review the details before updating your health profile.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={acceptAllSuitable}
              className="btn btn-outline btn-sm text-xs"
              title="Accept all new records while rejecting duplicates"
            >
              <CheckCircle size={14} /> Accept All Suitable
            </button>
          </div>
        </div>

        {/* Warnings & Source info */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
            <FileText size={14} className="text-[var(--color-emerald-primary)]" />
            <span className="font-semibold text-[var(--color-text-primary)]">{document.file_name}</span>
            <span>• Method: {extraction.extraction_method.toUpperCase()}</span>
            <span>• Type: {extraction.document_type.replace('-', ' ')}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="badge badge-success text-[11px]">
              {approvedCount} items ready to apply
            </span>
            {review.summary.conflictingItems > 0 && (
              <span className="badge badge-warning text-[11px] flex items-center gap-1">
                <AlertTriangle size={12} /> {review.summary.conflictingItems} conflicts detected
              </span>
            )}
            {review.summary.duplicateItems > 0 && (
              <span className="badge badge-neutral text-[11px]">
                {review.summary.duplicateItems} duplicates auto-filtered
              </span>
            )}
          </div>
        </div>

        {extraction.warnings.length > 0 && (
          <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2">
            <AlertTriangle size={16} className="shrink-0 text-amber-600 mt-0.5" />
            <div className="space-y-0.5">
              {extraction.warnings.map((w, idx) => (
                <p key={idx}>{w}</p>
              ))}
            </div>
          </div>
        )}

        {extraction.rejected_candidates && extraction.rejected_candidates.length > 0 && (
          <div className="mt-3 p-3 rounded-xl bg-blue-50/80 dark:bg-blue-950/20 border border-blue-200/80 dark:border-blue-900 text-blue-900 dark:text-blue-200 text-xs flex items-start gap-2.5">
            <Info size={16} className="shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div>
              <span className="font-semibold">Clinical Quality Filtering Active:</span>{' '}
              <span>
                {extraction.rejected_candidates.length} non-clinical text {extraction.rejected_candidates.length === 1 ? 'fragment was' : 'fragments were'} automatically filtered out to prevent corrupted medications or allergens.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 1: Patient Information Review */}
      {extraction.patient_info && Object.keys(extraction.patient_info).length > 0 && (
        <div className="card p-5 bg-white border border-[var(--color-border)] shadow-xs">
          <button
            type="button"
            onClick={() => toggleSection('patient')}
            className="w-full flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-[var(--color-mint-soft)] text-[var(--color-emerald-primary)]">
                <User size={16} />
              </div>
              <h3 className="font-bold text-sm text-[var(--color-teal-deep)]">
                1. Patient Demographics Detected
              </h3>
            </div>
            {expandedSections.patient ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {expandedSections.patient && (
            <div className="mt-4 pt-3 border-t border-[var(--color-border-light)] text-xs grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {extraction.patient_info.patient_name && (
                <div className="p-2.5 rounded-lg bg-[var(--color-bg-page)]">
                  <span className="text-[10px] uppercase font-bold text-[var(--color-text-light)] block">
                    Reported Patient Name
                  </span>
                  <span className="font-semibold text-[var(--color-text-primary)]">
                    {extraction.patient_info.patient_name}
                  </span>
                  {userProfile && userProfile.full_name !== extraction.patient_info.patient_name && (
                    <p className="text-[10px] text-amber-600 mt-0.5">
                      Differs from your profile ({userProfile.full_name}). Your profile will not be overwritten automatically.
                    </p>
                  )}
                </div>
              )}

              {extraction.patient_info.age && (
                <div className="p-2.5 rounded-lg bg-[var(--color-bg-page)]">
                  <span className="text-[10px] uppercase font-bold text-[var(--color-text-light)] block">
                    Reported Age
                  </span>
                  <span className="font-semibold text-[var(--color-text-primary)]">
                    {extraction.patient_info.age} years
                  </span>
                </div>
              )}

              {extraction.patient_info.gender && (
                <div className="p-2.5 rounded-lg bg-[var(--color-bg-page)]">
                  <span className="text-[10px] uppercase font-bold text-[var(--color-text-light)] block">
                    Gender
                  </span>
                  <span className="font-semibold text-[var(--color-text-primary)] capitalize">
                    {extraction.patient_info.gender}
                  </span>
                </div>
              )}

              {extraction.patient_info.hospital_name && (
                <div className="p-2.5 rounded-lg bg-[var(--color-bg-page)]">
                  <span className="text-[10px] uppercase font-bold text-[var(--color-text-light)] block">
                    Hospital / Diagnostic Centre
                  </span>
                  <span className="font-semibold text-[var(--color-text-primary)]">
                    {extraction.patient_info.hospital_name}
                  </span>
                </div>
              )}

              {extraction.patient_info.report_date && (
                <div className="p-2.5 rounded-lg bg-[var(--color-bg-page)]">
                  <span className="text-[10px] uppercase font-bold text-[var(--color-text-light)] block">
                    Report Date
                  </span>
                  <span className="font-semibold text-[var(--color-text-primary)]">
                    {extraction.patient_info.report_date}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SECTION 2: Medications */}
      <div className="card p-5 bg-white border border-[var(--color-border)] shadow-xs">
        <button
          type="button"
          onClick={() => toggleSection('medications')}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-[var(--color-mint-soft)] text-[var(--color-emerald-primary)]">
              <Pill size={16} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[var(--color-teal-deep)]">
                2. Prescribed Medications ({review.medications.length})
              </h3>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                Review dosages and schedules before adding to your active regimen.
              </p>
            </div>
          </div>
          {expandedSections.medications ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {expandedSections.medications && (
          <div className="mt-4 pt-3 border-t border-[var(--color-border-light)] space-y-3">
            {review.medications.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)] italic py-2">
                No medication entries identified in this report.
              </p>
            ) : (
              review.medications.map((item: ReviewItem<ExtractedMedication>) => {
                const data = { ...item.data, ...(item.edited_data || {}) };
                const isAccepted = item.status === 'accepted' || item.status === 'edited';
                const isConflict = item.status === 'conflict';
                const isRejected = item.status === 'rejected';

                return (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-xl border transition-all text-xs ${
                      isAccepted
                        ? 'border-[var(--color-emerald-primary)] bg-[var(--color-mint-soft)]/30'
                        : isConflict
                        ? 'border-amber-400 bg-amber-50/50'
                        : 'border-[var(--color-border-light)] bg-gray-50/60 opacity-60'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-[var(--color-text-primary)]">
                            {data.name}
                          </span>
                          {data.strength && (
                            <span className="px-2 py-0.5 rounded-md bg-white border border-[var(--color-border)] font-semibold text-[var(--color-teal-deep)]">
                              {data.strength}
                            </span>
                          )}
                          {data.status_hint && (
                            <span className="badge badge-neutral text-[10px] capitalize">
                              {data.status_hint.replace('_', ' ')}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-[var(--color-text-muted)] mt-1">
                          {data.frequency || 'Daily'} {data.dose ? `• ${data.dose}` : ''} {data.instructions ? `• ${data.instructions}` : ''}
                        </p>

                        {item.match_info?.match_type === 'conflict' && (
                          <div className="mt-1.5 flex items-center gap-1.5 text-amber-700 font-semibold text-[11px]">
                            <AlertTriangle size={12} />
                            <span>{item.match_info.conflict_description}</span>
                          </div>
                        )}

                        {item.match_info?.match_type === 'exact_duplicate' && (
                          <p className="text-[11px] text-[var(--color-text-light)] mt-1">
                            Already in your medications: {item.match_info.existing_record_summary}
                          </p>
                        )}
                      </div>

                      {/* Accept / Reject / Edit Controls */}
                      <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => setItemStatus('medications', item.id, 'accepted')}
                          className={`btn-icon p-1.5 rounded-lg border text-xs ${
                            isAccepted
                              ? 'bg-[var(--color-emerald-primary)] text-white border-[var(--color-emerald-primary)]'
                              : 'bg-white text-[var(--color-text-muted)] hover:bg-[var(--color-mint-soft)]'
                          }`}
                          title="Accept medication"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setItemStatus('medications', item.id, 'rejected')}
                          className={`btn-icon p-1.5 rounded-lg border text-xs ${
                            isRejected
                              ? 'bg-red-600 text-white border-red-600'
                              : 'bg-white text-[var(--color-text-muted)] hover:bg-red-50 hover:text-red-600'
                          }`}
                          title="Reject / Don't add"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* SECTION 3: Allergies */}
      <div className="card p-5 bg-white border border-[var(--color-border)] shadow-xs">
        <button
          type="button"
          onClick={() => toggleSection('allergies')}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-red-100 text-red-600">
              <AlertTriangle size={16} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[var(--color-teal-deep)]">
                3. Allergies & Sensitivities ({review.allergies.length})
              </h3>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                Identified adverse reactions and allergen warnings.
              </p>
            </div>
          </div>
          {expandedSections.allergies ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {expandedSections.allergies && (
          <div className="mt-4 pt-3 border-t border-[var(--color-border-light)] space-y-3">
            {review.allergies.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)] italic py-2">
                No allergy entries identified in this report.
              </p>
            ) : (
              review.allergies.map((item: ReviewItem<ExtractedAllergy>) => {
                const data = { ...item.data, ...(item.edited_data || {}) };
                const isAccepted = item.status === 'accepted' || item.status === 'edited';
                const isRejected = item.status === 'rejected';

                return (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-xl border transition-all text-xs ${
                      isAccepted
                        ? 'border-red-400 bg-red-50/40'
                        : 'border-[var(--color-border-light)] bg-gray-50/60 opacity-60'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-red-700">
                            {data.allergen}
                          </span>
                          <span className="badge badge-danger text-[10px] uppercase font-bold">
                            {data.severity || 'Moderate'}
                          </span>
                        </div>
                        {data.reaction && (
                          <p className="text-xs text-[var(--color-text-muted)] mt-1">
                            Reaction: {data.reaction}
                          </p>
                        )}
                        {item.match_info?.match_type === 'exact_duplicate' && (
                          <p className="text-[11px] text-[var(--color-text-light)] mt-1">
                            Already recorded in allergies list.
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => setItemStatus('allergies', item.id, 'accepted')}
                          className={`btn-icon p-1.5 rounded-lg border text-xs ${
                            isAccepted
                              ? 'bg-red-600 text-white border-red-600'
                              : 'bg-white text-[var(--color-text-muted)] hover:bg-red-50'
                          }`}
                          title="Accept allergy"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setItemStatus('allergies', item.id, 'rejected')}
                          className={`btn-icon p-1.5 rounded-lg border text-xs ${
                            isRejected
                              ? 'bg-gray-700 text-white border-gray-700'
                              : 'bg-white text-[var(--color-text-muted)]'
                          }`}
                          title="Reject / Don't add"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* SECTION 4: Laboratory Results */}
      <div className="card p-5 bg-white border border-[var(--color-border)] shadow-xs">
        <button
          type="button"
          onClick={() => toggleSection('lab_results')}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-blue-100 text-blue-600">
              <FlaskConical size={16} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[var(--color-teal-deep)]">
                4. Laboratory & Diagnostic Results ({review.lab_results.length})
              </h3>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                Structured test parameters with reference ranges and abnormal indicators.
              </p>
            </div>
          </div>
          {expandedSections.lab_results ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {expandedSections.lab_results && (
          <div className="mt-4 pt-3 border-t border-[var(--color-border-light)] space-y-2.5">
            {review.lab_results.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)] italic py-2">
                No lab test values identified in this report.
              </p>
            ) : (
              review.lab_results.map((item: ReviewItem<ExtractedLabResult>) => {
                const data = { ...item.data, ...(item.edited_data || {}) };
                const isAccepted = item.status === 'accepted' || item.status === 'edited';
                const isRejected = item.status === 'rejected';

                const isAbnormal = data.result_status === 'high' || data.result_status === 'low' || data.result_status === 'critical';

                return (
                  <div
                    key={item.id}
                    className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-colors ${
                      isAccepted
                        ? 'border-blue-200 bg-blue-50/20'
                        : 'border-[var(--color-border-light)] bg-gray-50/60 opacity-60'
                    }`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[var(--color-text-primary)]">
                          {data.test_name}
                        </span>
                        {isAbnormal && (
                          <span
                            className={`badge text-[10px] font-bold uppercase ${
                              data.result_status === 'high'
                                ? 'badge-warning'
                                : data.result_status === 'low'
                                ? 'badge-neutral'
                                : 'badge-danger'
                            }`}
                          >
                            {data.result_status}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs mt-1 text-[var(--color-text-muted)]">
                        <span>
                          Value: <strong className="text-[var(--color-text-primary)]">{data.result_value}</strong> {data.unit || ''}
                        </span>
                        {data.reference_range && (
                          <span>Ref: {data.reference_range}</span>
                        )}
                        {data.test_date && (
                          <span>Date: {data.test_date}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => setItemStatus('lab_results', item.id, 'accepted')}
                        className={`btn-icon p-1.5 rounded-lg border text-xs ${
                          isAccepted
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-[var(--color-text-muted)] hover:bg-blue-50'
                        }`}
                        title="Accept lab result"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setItemStatus('lab_results', item.id, 'rejected')}
                        className={`btn-icon p-1.5 rounded-lg border text-xs ${
                          isRejected
                            ? 'bg-gray-700 text-white border-gray-700'
                            : 'bg-white text-[var(--color-text-muted)]'
                        }`}
                        title="Reject / Don't add"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* SECTION 5: Doctor Consultations & Follow-Ups */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Doctors / Consultation */}
        <div className="card p-5 bg-white border border-[var(--color-border)] shadow-xs">
          <div className="flex items-center gap-2 mb-3">
            <Stethoscope size={16} className="text-[var(--color-emerald-primary)]" />
            <h3 className="font-bold text-sm text-[var(--color-teal-deep)]">
              Doctor Consultation
            </h3>
          </div>

          <div className="space-y-3 text-xs">
            {review.doctors.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)] italic">
                No doctor name detected.
              </p>
            ) : (
              review.doctors.map((item: ReviewItem<ExtractedDoctorInfo>) => {
                const data = { ...item.data, ...(item.edited_data || {}) };
                const isAccepted = item.status === 'accepted' || item.status === 'edited';

                return (
                  <div
                    key={item.id}
                    className={`p-3 rounded-lg border ${
                      isAccepted
                        ? 'border-[var(--color-emerald-primary)] bg-[var(--color-mint-soft)]/30'
                        : 'border-[var(--color-border-light)] opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-sm text-[var(--color-text-primary)]">
                          {data.doctor_name}
                        </p>
                        <p className="text-[11px] text-[var(--color-text-muted)]">
                          {data.specialty || 'General Practitioner'} • {data.hospital_name || 'Clinic'}
                        </p>
                        {data.consultation_date && (
                          <p className="text-[11px] text-[var(--color-text-light)] mt-0.5">
                            Date: {data.consultation_date}
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setItemStatus('doctors', item.id, isAccepted ? 'rejected' : 'accepted')
                        }
                        className={`btn-icon p-1.5 rounded-lg border text-xs ${
                          isAccepted ? 'bg-[var(--color-emerald-primary)] text-white' : 'bg-white'
                        }`}
                      >
                        <Check size={14} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Follow-Ups / Reminders */}
        <div className="card p-5 bg-white border border-[var(--color-border)] shadow-xs">
          <div className="flex items-center gap-2 mb-3">
            <Calendar size={16} className="text-[var(--color-emerald-primary)]" />
            <h3 className="font-bold text-sm text-[var(--color-teal-deep)]">
              Follow-up Reminders ({review.follow_ups.length})
            </h3>
          </div>

          <div className="space-y-3 text-xs">
            {review.follow_ups.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)] italic">
                No future follow-up dates detected.
              </p>
            ) : (
              review.follow_ups.map((item: ReviewItem<ExtractedFollowUp>) => {
                const data = { ...item.data, ...(item.edited_data || {}) };
                const isAccepted = item.status === 'accepted' || item.status === 'edited';

                return (
                  <div
                    key={item.id}
                    className={`p-3 rounded-lg border ${
                      isAccepted
                        ? 'border-[var(--color-emerald-primary)] bg-[var(--color-mint-soft)]/30'
                        : 'border-[var(--color-border-light)] opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-sm text-[var(--color-text-primary)]">
                          {data.title}
                        </p>
                        <p className="text-[11px] text-[var(--color-emerald-primary)] font-semibold">
                          Scheduled: {data.follow_up_date}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setItemStatus('follow_ups', item.id, isAccepted ? 'rejected' : 'accepted')
                        }
                        className={`btn-icon p-1.5 rounded-lg border text-xs ${
                          isAccepted ? 'bg-[var(--color-emerald-primary)] text-white' : 'bg-white'
                        }`}
                      >
                        <Check size={14} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* SECTION 6: Explicit Diagnoses & Procedures */}
      {(review.diagnoses.length > 0 || review.procedures.length > 0) && (
        <div className="card p-5 bg-white border border-[var(--color-border)] shadow-xs">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={16} className="text-[var(--color-emerald-primary)]" />
            <h3 className="font-bold text-sm text-[var(--color-teal-deep)]">
              Clinical History & Procedures
            </h3>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            {review.diagnoses.map((d: ReviewItem<ExtractedDiagnosis>) => (
              <span
                key={d.id}
                className="px-3 py-1 rounded-full bg-[var(--color-mint-soft)] text-[var(--color-teal-deep)] font-semibold border border-[var(--color-border)]"
              >
                Diagnosis: {d.data.diagnosis}
              </span>
            ))}
            {review.procedures.map((p: ReviewItem<ExtractedProcedure>) => (
              <span
                key={p.id}
                className="px-3 py-1 rounded-full bg-blue-50 text-blue-900 font-semibold border border-blue-200"
              >
                Procedure: {p.data.procedure_name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Safety & Compliance Disclaimer */}
      <div className="p-4 rounded-xl bg-[var(--color-bg-page)] border border-[var(--color-border-light)] text-[11px] text-[var(--color-text-muted)] space-y-1">
        <div className="flex items-center gap-1.5 font-bold text-[var(--color-text-primary)]">
          <ShieldCheck size={14} className="text-[var(--color-emerald-primary)]" />
          <span>Patient-Controlled Health Records Verification</span>
        </div>
        <p>
          Information extracted via client-side OCR and deterministic text analysis is patient-provided and subject to your review. Only the items you accept will be committed to your ZCare profile. Original documents remain stored securely in your Health Vault.
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-[var(--color-border)]">
        <button
          type="button"
          onClick={onCancel}
          disabled={isApplying}
          className="btn btn-outline text-xs w-full sm:w-auto"
        >
          Cancel
        </button>

        <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={onSaveDocumentOnly}
            disabled={isApplying}
            className="btn btn-outline text-xs w-full sm:w-auto"
          >
            Save Document Only
          </button>

          <button
            type="button"
            onClick={() => onConfirmUpdates(review)}
            disabled={isApplying}
            className="btn btn-primary text-xs w-full sm:w-auto flex items-center justify-center gap-1.5"
          >
            {isApplying ? (
              <>
                <span className="spinner spinner-sm" />
                <span>Updating Profile...</span>
              </>
            ) : (
              <>
                <CheckCircle size={14} />
                <span>Confirm & Update Health Profile ({approvedCount} items)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
