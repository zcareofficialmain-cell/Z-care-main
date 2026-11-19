// ============================================================
// ZCare Medical Extraction Types
// Structured types for the automatic medical report scanning
// and health profile updating feature.
// ============================================================

import type {
  MedicationStatus,
  AllergySeverity,
  VerificationStatus,
  ReminderType,
  DocumentType,
} from './index';

// --- Extraction Status & Confidence ---
export type ExtractionConfidence = 'high' | 'medium' | 'low';

export type ExtractionItemStatus =
  | 'accepted'
  | 'rejected'
  | 'edited'
  | 'pending'
  | 'conflict';

export type DocumentExtractionStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'needs_review'
  | 'applied'
  | 'failed'
  | 'cancelled';

// --- Extracted Patient Information ---
export interface ExtractedPatientInfo {
  patient_name?: string;
  age?: number;
  date_of_birth?: string;
  gender?: string;
  patient_id?: string;
  hospital_name?: string;
  hospital_location?: string;
  consultation_date?: string;
  report_date?: string;
}

// --- Extracted Doctor & Hospital ---
export interface ExtractedDoctorInfo {
  doctor_name: string;
  specialty?: string;
  hospital_name?: string;
  department?: string;
  consultation_date?: string;
  visit_type?: string;
  follow_up_date?: string;
  confidence: ExtractionConfidence;
  source_page?: number;
  source_excerpt?: string;
}

// --- Extracted Diagnosis ---
export interface ExtractedDiagnosis {
  diagnosis: string;
  icd_code?: string;
  date_diagnosed?: string;
  source_document_date?: string;
  confidence: ExtractionConfidence;
  source_page?: number;
  source_excerpt?: string;
}

// --- Extracted Medication ---
export interface ExtractedMedication {
  name: string;
  brand_name?: string;
  generic_name?: string;
  strength?: string;
  dose?: string;
  route?: string;
  frequency?: string;
  instructions?: string;
  duration?: string;
  start_date?: string;
  end_date?: string;
  prescribing_doctor?: string;
  source_document_date?: string;
  source_section?: string;
  status_hint?: 'newly_prescribed' | 'currently_taking' | 'discontinued' | 'historical' | 'unclear';
  confidence: ExtractionConfidence;
  source_page?: number;
  source_excerpt?: string;
}

// --- Extracted Allergy ---
export interface ExtractedAllergy {
  allergen: string;
  reaction?: string;
  severity?: AllergySeverity;
  source?: string;
  date_reported?: string;
  verification_status?: string;
  source_document_date?: string;
  source_section?: string;
  confidence: ExtractionConfidence;
  source_page?: number;
  source_excerpt?: string;
}

// --- Extracted Lab Result ---
export interface ExtractedLabResult {
  test_name: string;
  result_value: string;
  unit?: string;
  reference_range?: string;
  result_status?: 'normal' | 'high' | 'low' | 'critical' | 'unknown';
  test_date?: string;
  source_hospital?: string;
  notes?: string;
  confidence: ExtractionConfidence;
  source_page?: number;
  source_excerpt?: string;
}

// --- Extracted Follow-Up ---
export interface ExtractedFollowUp {
  follow_up_date: string;
  title: string;
  type: ReminderType;
  department?: string;
  doctor_name?: string;
  notes?: string;
  confidence: ExtractionConfidence;
  source_page?: number;
  source_excerpt?: string;
}

// --- Extracted Procedure ---
export interface ExtractedProcedure {
  procedure_name: string;
  procedure_date?: string;
  hospital?: string;
  treating_doctor?: string;
  discharge_date?: string;
  treatment_notes?: string;
  confidence: ExtractionConfidence;
  source_page?: number;
  source_excerpt?: string;
}

// --- Rejected Candidate (for audit and transparency) ---
export interface RejectedExtractionCandidate {
  raw_text: string;
  category: 'medication' | 'allergy' | 'lab_result' | 'unknown';
  rejection_reason: string;
  source_page?: number | null;
  source_section?: string;
}

// --- Complete Extraction Result ---
export interface MedicalExtractionResult {
  document_id: string;
  file_name: string;
  document_type: DocumentType;
  extraction_method: 'pdf-text' | 'ocr' | 'fallback';
  raw_text: string;
  total_pages?: number;

  patient_info: ExtractedPatientInfo;
  doctors: ExtractedDoctorInfo[];
  diagnoses: ExtractedDiagnosis[];
  medications: ExtractedMedication[];
  allergies: ExtractedAllergy[];
  lab_results: ExtractedLabResult[];
  follow_ups: ExtractedFollowUp[];
  procedures: ExtractedProcedure[];

  rejected_candidates?: RejectedExtractionCandidate[];
  warnings: string[];
  extractor_version: string;
  processed_at: string;
}

// --- Review Item Wrapper ---
// Wraps each extracted item with review state for the UI
export interface ReviewItem<T> {
  id: string;
  data: T;
  status: ExtractionItemStatus;
  edited_data?: Partial<T>;
  match_info?: MatchInfo;
  category: ExtractionCategory;
}

export type ExtractionCategory =
  | 'patient_info'
  | 'doctor'
  | 'diagnosis'
  | 'medication'
  | 'allergy'
  | 'lab_result'
  | 'follow_up'
  | 'procedure';

// --- Match Info (for duplicate/conflict detection) ---
export interface MatchInfo {
  match_type: 'exact_duplicate' | 'potential_duplicate' | 'conflict' | 'new';
  existing_record_id?: string;
  existing_record_summary?: string;
  conflict_description?: string;
}

// --- Matched Extraction Review Structure ---
export interface MatchedExtractionReview {
  medications: ReviewItem<ExtractedMedication>[];
  allergies: ReviewItem<ExtractedAllergy>[];
  doctors: ReviewItem<ExtractedDoctorInfo>[];
  lab_results: ReviewItem<ExtractedLabResult>[];
  follow_ups: ReviewItem<ExtractedFollowUp>[];
  diagnoses: ReviewItem<ExtractedDiagnosis>[];
  procedures: ReviewItem<ExtractedProcedure>[];
  summary: {
    totalItems: number;
    newItems: number;
    duplicateItems: number;
    conflictingItems: number;
  };
}

// --- Document Extraction Record (stored in DB) ---
export interface DocumentExtraction {
  id: string;
  user_id: string;
  medical_document_id: string;
  status: DocumentExtractionStatus;
  extracted_data: MedicalExtractionResult | null;
  warnings: string[];
  extractor_version: string;
  processed_at: string | null;
  reviewed_at: string | null;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
}

// --- Lab Result Record (stored in DB) ---
export interface LabResult {
  id: string;
  user_id: string;
  medical_document_id: string | null;
  test_name: string;
  result_value: string;
  unit: string | null;
  reference_range: string | null;
  result_status: 'normal' | 'high' | 'low' | 'critical' | 'unknown';
  test_date: string | null;
  source_hospital: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LabResultFormData {
  test_name: string;
  result_value: string;
  unit: string;
  reference_range: string;
  result_status: string;
  test_date: string;
  source_hospital: string;
  notes: string;
}

// --- Medical Record Source (provenance tracking) ---
export interface MedicalRecordSource {
  id: string;
  user_id: string;
  medical_document_id: string;
  record_type: 'medication' | 'allergy' | 'consultation' | 'lab_result' | 'reminder' | 'diagnosis';
  record_id: string;
  source_page: number | null;
  source_excerpt: string | null;
  created_at: string;
}

// --- Extraction Progress ---
export interface ExtractionProgress {
  step: number;
  totalSteps: number;
  label: string;
  detail?: string;
  percentage: number;
}

// --- Apply Result ---
export interface ApplyExtractionResult {
  medications_created: number;
  allergies_created: number;
  consultations_created: number;
  lab_results_created: number;
  reminders_created: number;
  diagnoses_stored: number;
  conflicts_skipped: number;
  duplicates_skipped: number;
  errors: string[];
}

