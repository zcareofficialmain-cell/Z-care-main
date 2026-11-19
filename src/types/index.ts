// ============================================================
// ZCare Application Types
// ============================================================

// --- Auth & Profile ---
export interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  date_of_birth: string | null;
  gender: string | null;
  language: string | null;
  height: number | null;
  weight: number | null;
  profile_photo_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileFormData {
  full_name: string;
  date_of_birth: string;
  gender: string;
  language: string;
  height: string;
  weight: string;
}

// --- Subscriptions ---
export type PlanId = 'trial' | 'monthly' | 'yearly';

export interface PlanDefinition {
  id: PlanId;
  name: string;
  period: PlanId;
  price: number;
  currency: string;
  /** "Free", "₹199", "₹1,299" */
  priceLabel: string;
  /** "1 day", "/month", "/year" */
  durationLabel: string;
  /** Billing period and total amount, shown under the price. */
  billingLabel: string;
  features: string[];
  recommended?: boolean;
  savings?: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan: string;
  status: 'active' | 'cancelled' | 'expired' | 'trial' | 'pending';
  amount: number;
  currency: string;
  provider_reference: string | null;
  period_start: string;
  period_end: string;
  created_at: string;
  updated_at: string;
}

// --- Medications ---
export type MedicationStatus = 'active' | 'paused' | 'completed' | 'discontinued';

export interface Medication {
  id: string;
  user_id: string;
  name: string;
  strength: string | null;
  dose: string | null;
  route: string | null;
  frequency: string | null;
  instructions: string | null;
  start_date: string | null;
  end_date: string | null;
  status: MedicationStatus;
  notes: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}

export interface MedicationFormData {
  name: string;
  strength: string;
  dose: string;
  route: string;
  frequency: string;
  instructions: string;
  start_date: string;
  end_date: string;
  status: MedicationStatus;
  notes: string;
}

// --- Allergies ---
export type AllergySeverity = 'mild' | 'moderate' | 'severe' | 'life-threatening';
export type VerificationStatus = 'patient-reported' | 'clinician-confirmed' | 'unverified';

export interface Allergy {
  id: string;
  user_id: string;
  allergen: string;
  reaction: string | null;
  severity: AllergySeverity;
  first_noted_at: string | null;
  source: string | null;
  verification_status: VerificationStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AllergyFormData {
  allergen: string;
  reaction: string;
  severity: AllergySeverity;
  first_noted_at: string;
  source: string;
  verification_status: VerificationStatus;
  notes: string;
}

// --- Insurance ---
export interface InsurancePolicy {
  id: string;
  user_id: string;
  provider: string;
  policy_number: string;
  plan_name: string | null;
  sum_insured: number | null;
  valid_from: string | null;
  valid_until: string | null;
  premium: number | null;
  support_contact: string | null;
  notes: string | null;
  document_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface InsurancePolicyFormData {
  provider: string;
  policy_number: string;
  plan_name: string;
  sum_insured: string;
  valid_from: string;
  valid_until: string;
  premium: string;
  support_contact: string;
  notes: string;
}

export interface InsuranceMember {
  id: string;
  user_id: string;
  policy_id: string;
  member_name: string;
  relationship: string;
  created_at: string;
}

// --- Consultations ---
export interface Consultation {
  id: string;
  user_id: string;
  doctor_name: string;
  specialty: string | null;
  hospital_name: string | null;
  consultation_date: string;
  reason: string | null;
  notes: string | null;
  follow_up_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConsultationFormData {
  doctor_name: string;
  specialty: string;
  hospital_name: string;
  consultation_date: string;
  reason: string;
  notes: string;
  follow_up_date: string;
}

// --- Medical Documents ---
export type DocumentType = 'report' | 'prescription' | 'lab-result' | 'imaging' | 'discharge-summary' | 'other';
export type ExtractionStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';

export interface MedicalDocument {
  id: string;
  user_id: string;
  consultation_id: string | null;
  document_type: DocumentType;
  title: string;
  file_path: string;
  file_name: string;
  file_type: string;
  document_date: string | null;
  hospital_name: string | null;
  description: string | null;
  extraction_status: ExtractionStatus;
  created_at: string;
  updated_at: string;
}

export interface DocumentUploadFormData {
  title: string;
  document_type: DocumentType;
  hospital_name: string;
  document_date: string;
  consultation_id: string;
  description: string;
}

// --- Reminders ---
export type ReminderType = 'appointment' | 'blood-test' | 'vaccination' | 'medication' | 'follow-up' | 'other';
export type ReminderStatus = 'upcoming' | 'completed' | 'missed' | 'snoozed';

export interface Reminder {
  id: string;
  user_id: string;
  title: string;
  type: ReminderType;
  due_at: string;
  timezone: string | null;
  recurrence_rule: string | null;
  status: ReminderStatus;
  notes: string | null;
  related_record_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReminderFormData {
  title: string;
  type: ReminderType;
  due_date: string;
  due_time: string;
  timezone: string;
  recurrence_rule: string;
  status: ReminderStatus;
  notes: string;
  related_record_id: string;
}

// --- Dashboard ---
export interface DashboardSummary {
  totalMedications: number;
  activeMedications: number;
  totalAllergies: number;
  totalConsultations: number;
  totalDocuments: number;
  totalInsurancePolicies: number;
  upcomingReminders: number;
  recentActivity: ActivityItem[];
}

export interface ActivityItem {
  id: string;
  type: 'medication' | 'allergy' | 'consultation' | 'document' | 'insurance' | 'reminder';
  action: 'created' | 'updated' | 'deleted';
  title: string;
  timestamp: string;
}
