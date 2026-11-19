import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type {
  Profile, ProfileFormData,
  Medication, MedicationFormData,
  Allergy, AllergyFormData,
  InsurancePolicy, InsurancePolicyFormData, InsuranceMember,
  Consultation, ConsultationFormData,
  MedicalDocument, DocumentUploadFormData, ExtractionStatus,
  Reminder, ReminderFormData,
  Subscription,
} from '@/types';
import type {
  LabResult,
  LabResultFormData,
  DocumentExtraction,
  MedicalRecordSource,
} from '@/types/medicalExtraction';
import {
  SEED_MEDICATIONS,
  SEED_ALLERGIES,
  SEED_POLICIES,
  SEED_MEMBERS,
  SEED_CONSULTATIONS,
  SEED_DOCUMENTS,
  SEED_REMINDERS,
  SEED_LAB_RESULTS,
} from './seedData';
import { getRecordValidationInfo, auditMedicalRecords } from './medicalValidator.ts';
import { PLAN_PRICES, membershipState, planPeriodEnd, type MembershipState } from '../lib/plans.ts';

/**
 * True when data must come from this browser instead of Supabase: offline mode,
 * or the "Sign In as Demo User" account, which is not a Supabase user and always
 * uses the built-in sample data (seedData.ts).
 */
function isLocalStore(): boolean {
  if (!isSupabaseConfigured()) return true;
  try {
    return localStorage.getItem('drec_demo_session') === 'true';
  } catch {
    return false;
  }
}

// Local storage helper
function getLocal<T>(key: string, defaultData: T): T {
  try {
    const item = localStorage.getItem(`drec_${key}`);
    if (!item) {
      localStorage.setItem(`drec_${key}`, JSON.stringify(defaultData));
      return defaultData;
    }
    return JSON.parse(item);
  } catch {
    return defaultData;
  }
}

// Postgres rejects '' for DATE / UUID / NUMERIC columns. Edit forms keep blank
// optional fields as '', so convert them to null before sending an UPDATE.
function blanksToNull<T extends object>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = v === '' ? null : v;
  }
  return out;
}

function setLocal<T>(key: string, data: T): void {
  try {
    localStorage.setItem(`drec_${key}`, JSON.stringify(data));
  } catch (err) {
    console.error('Failed to save to local storage', err);
  }
}

// ============================================================
// Profile
// ============================================================
export async function getProfile(userId: string): Promise<Profile | null> {
  if (isLocalStore()) {
    const stored = getLocal<Profile | null>(`profile_${userId}`, null);
    if (!stored && userId.includes('demo')) {
      return {
        id: 'demo-profile-126',
        user_id: userId,
        full_name: 'Aarav Sharma',
        date_of_birth: '1990-05-15',
        gender: 'male',
        language: 'English',
        height: 175,
        weight: 70,
        profile_photo_path: null,
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: new Date().toISOString(),
      };
    }
    return stored;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function upsertProfile(userId: string, form: Partial<ProfileFormData>): Promise<Profile> {
  if (isLocalStore()) {
    const existing = await getProfile(userId);
    const updated: Profile = {
      id: existing?.id || 'prof-' + Date.now(),
      user_id: userId,
      full_name: form.full_name || existing?.full_name || 'Patient',
      date_of_birth: form.date_of_birth !== undefined ? form.date_of_birth : (existing?.date_of_birth || null),
      gender: form.gender !== undefined ? form.gender : (existing?.gender || null),
      language: form.language !== undefined ? form.language : (existing?.language || 'English'),
      height: form.height ? parseFloat(form.height) : (existing?.height || null),
      weight: form.weight ? parseFloat(form.weight) : (existing?.weight || null),
      profile_photo_path: existing?.profile_photo_path || null,
      created_at: existing?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setLocal(`profile_${userId}`, updated);
    return updated;
  }

  const payload = {
    user_id: userId,
    full_name: form.full_name,
    date_of_birth: form.date_of_birth || null,
    gender: form.gender || null,
    language: form.language || null,
    height: form.height ? parseFloat(form.height) : null,
    weight: form.weight ? parseFloat(form.weight) : null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('profiles')
    .upsert(payload, { onConflict: 'user_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function uploadProfilePhoto(userId: string, file: File): Promise<string> {
  if (isLocalStore()) {
    const fakePath = URL.createObjectURL(file);
    const prof = await getProfile(userId);
    if (prof) {
      prof.profile_photo_path = fakePath;
      setLocal(`profile_${userId}`, prof);
    }
    return fakePath;
  }

  const ext = file.name.split('.').pop();
  const path = `${userId}/profile.${ext}`;
  const { error } = await supabase.storage
    .from('profile-photos')
    .upload(path, file, { upsert: true });
  if (error) throw error;

  await supabase.from('profiles').update({ profile_photo_path: path }).eq('user_id', userId);
  return path;
}

export function getProfilePhotoUrl(path: string | null): string | null {
  if (!path) return null;
  if (isLocalStore() || path.startsWith('blob:') || path.startsWith('http')) {
    return path;
  }
  const { data } = supabase.storage.from('profile-photos').getPublicUrl(path);
  return data?.publicUrl || null;
}

// ============================================================
// Medications
// ============================================================
export async function getMedications(userId: string): Promise<Medication[]> {
  if (isLocalStore()) {
    const list = getLocal<Medication[]>(`medications_${userId}`, userId.includes('demo') ? SEED_MEDICATIONS : []);
    return list;
  }

  const { data, error } = await supabase
    .from('medications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createMedication(userId: string, form: MedicationFormData): Promise<Medication> {
  if (isLocalStore()) {
    const list = await getMedications(userId);
    const newMed: Medication = {
      id: 'med-' + Date.now(),
      user_id: userId,
      name: form.name,
      strength: form.strength || null,
      dose: form.dose || null,
      route: form.route || null,
      frequency: form.frequency || null,
      instructions: form.instructions || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      status: form.status,
      notes: form.notes || null,
      source: 'User Entry',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    list.unshift(newMed);
    setLocal(`medications_${userId}`, list);
    return newMed;
  }

  const { data, error } = await supabase
    .from('medications')
    .insert({
      user_id: userId,
      name: form.name,
      strength: form.strength || null,
      dose: form.dose || null,
      route: form.route || null,
      frequency: form.frequency || null,
      instructions: form.instructions || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      status: form.status,
      notes: form.notes || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateMedication(userId: string, id: string, form: Partial<MedicationFormData>): Promise<Medication> {
  if (isLocalStore()) {
    const list = await getMedications(userId);
    const idx = list.findIndex(m => m.id === id);
    if (idx === -1) throw new Error('Medication not found');
    list[idx] = { ...list[idx], ...form, updated_at: new Date().toISOString() };
    setLocal(`medications_${userId}`, list);
    return list[idx];
  }

  const { data, error } = await supabase
    .from('medications')
    .update({ ...blanksToNull(form), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMedication(userId: string, id: string): Promise<void> {
  if (isLocalStore()) {
    const list = await getMedications(userId);
    const updated = list.filter(m => m.id !== id);
    setLocal(`medications_${userId}`, updated);
    return;
  }

  const { error } = await supabase.from('medications').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// Allergies
// ============================================================
export async function getAllergies(userId: string): Promise<Allergy[]> {
  if (isLocalStore()) {
    return getLocal<Allergy[]>(`allergies_${userId}`, userId.includes('demo') ? SEED_ALLERGIES : []);
  }

  const { data, error } = await supabase
    .from('allergies')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createAllergy(userId: string, form: AllergyFormData): Promise<Allergy> {
  if (isLocalStore()) {
    const list = await getAllergies(userId);
    const newAlg: Allergy = {
      id: 'alg-' + Date.now(),
      user_id: userId,
      allergen: form.allergen,
      reaction: form.reaction || null,
      severity: form.severity,
      first_noted_at: form.first_noted_at || null,
      source: form.source || null,
      verification_status: form.verification_status,
      notes: form.notes || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    list.unshift(newAlg);
    setLocal(`allergies_${userId}`, list);
    return newAlg;
  }

  const { data, error } = await supabase
    .from('allergies')
    .insert({
      user_id: userId,
      allergen: form.allergen,
      reaction: form.reaction || null,
      severity: form.severity,
      first_noted_at: form.first_noted_at || null,
      source: form.source || null,
      verification_status: form.verification_status,
      notes: form.notes || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateAllergy(userId: string, id: string, form: Partial<AllergyFormData>): Promise<Allergy> {
  if (isLocalStore()) {
    const list = await getAllergies(userId);
    const idx = list.findIndex(a => a.id === id);
    if (idx === -1) throw new Error('Allergy not found');
    list[idx] = { ...list[idx], ...form, updated_at: new Date().toISOString() };
    setLocal(`allergies_${userId}`, list);
    return list[idx];
  }

  const { data, error } = await supabase
    .from('allergies')
    .update({ ...blanksToNull(form), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteAllergy(userId: string, id: string): Promise<void> {
  if (isLocalStore()) {
    const list = await getAllergies(userId);
    setLocal(`allergies_${userId}`, list.filter(a => a.id !== id));
    return;
  }

  const { error } = await supabase.from('allergies').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// Medical Data Quality & Safe Cleanup
// ============================================================
export interface InvalidMedicalRecordInfo {
  id: string;
  type: 'medication' | 'allergy';
  displayName: string;
  reason: string;
  details?: string;
  dateCreated?: string;
}

export async function getInvalidMedicalRecords(userId: string): Promise<{
  invalidMeds: { record: Medication; reason: string }[];
  invalidAllergies: { record: Allergy; reason: string }[];
  allInvalid: InvalidMedicalRecordInfo[];
}> {
  const [meds, algs] = await Promise.all([
    getMedications(userId),
    getAllergies(userId),
  ]);

  const invalidMeds: { record: Medication; reason: string }[] = [];
  const invalidAllergies: { record: Allergy; reason: string }[] = [];
  const allInvalid: InvalidMedicalRecordInfo[] = [];

  for (const med of meds) {
    const info = getRecordValidationInfo(med, 'medication');
    if (info.isInvalid) {
      const reason = info.reason || 'Failed clinical medication criteria';
      invalidMeds.push({ record: med, reason });
      allInvalid.push({
        id: med.id,
        type: 'medication',
        displayName: med.name,
        reason,
        details: med.strength ? `Strength: ${med.strength}` : undefined,
        dateCreated: med.created_at,
      });
    }
  }

  for (const alg of algs) {
    const info = getRecordValidationInfo(alg, 'allergy');
    if (info.isInvalid) {
      const reason = info.reason || 'Failed clinical allergen criteria';
      invalidAllergies.push({ record: alg, reason });
      allInvalid.push({
        id: alg.id,
        type: 'allergy',
        displayName: alg.allergen,
        reason,
        details: alg.reaction ? `Reaction: ${alg.reaction}` : undefined,
        dateCreated: alg.created_at,
      });
    }
  }

  return { invalidMeds, invalidAllergies, allInvalid };
}

export async function cleanupInvalidMedicalRecords(
  userId: string,
  targetIds?: { medIds?: string[]; allergyIds?: string[] }
): Promise<{ deletedMedicationsCount: number; deletedAllergiesCount: number }> {
  let medIdsToDelete: string[] = targetIds?.medIds || [];
  let allergyIdsToDelete: string[] = targetIds?.allergyIds || [];

  if (!targetIds) {
    const { invalidMeds, invalidAllergies } = await getInvalidMedicalRecords(userId);
    medIdsToDelete = invalidMeds.map(m => m.record.id);
    allergyIdsToDelete = invalidAllergies.map(a => a.record.id);
  }

  let deletedMedicationsCount = 0;
  let deletedAllergiesCount = 0;

  for (const id of medIdsToDelete) {
    try {
      await deleteMedication(userId, id);
      deletedMedicationsCount++;
    } catch (e) {
      console.error(`Failed to delete invalid medication ${id}:`, e);
    }
  }

  for (const id of allergyIdsToDelete) {
    try {
      await deleteAllergy(userId, id);
      deletedAllergiesCount++;
    } catch (e) {
      console.error(`Failed to delete invalid allergy ${id}:`, e);
    }
  }

  return { deletedMedicationsCount, deletedAllergiesCount };
}

// ============================================================
// Insurance Policies & Members
// ============================================================
export async function getInsurancePolicies(userId: string): Promise<InsurancePolicy[]> {
  if (isLocalStore()) {
    return getLocal<InsurancePolicy[]>(`policies_${userId}`, userId.includes('demo') ? SEED_POLICIES : []);
  }

  const { data, error } = await supabase
    .from('insurance_policies')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createInsurancePolicy(userId: string, form: InsurancePolicyFormData): Promise<InsurancePolicy> {
  if (isLocalStore()) {
    const list = await getInsurancePolicies(userId);
    const newPol: InsurancePolicy = {
      id: 'pol-' + Date.now(),
      user_id: userId,
      provider: form.provider,
      policy_number: form.policy_number,
      plan_name: form.plan_name || null,
      sum_insured: form.sum_insured ? parseFloat(form.sum_insured) : null,
      valid_from: form.valid_from || null,
      valid_until: form.valid_until || null,
      premium: form.premium ? parseFloat(form.premium) : null,
      support_contact: form.support_contact || null,
      notes: form.notes || null,
      document_path: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    list.unshift(newPol);
    setLocal(`policies_${userId}`, list);
    return newPol;
  }

  const { data, error } = await supabase
    .from('insurance_policies')
    .insert({
      user_id: userId,
      provider: form.provider,
      policy_number: form.policy_number,
      plan_name: form.plan_name || null,
      sum_insured: form.sum_insured ? parseFloat(form.sum_insured) : null,
      valid_from: form.valid_from || null,
      valid_until: form.valid_until || null,
      premium: form.premium ? parseFloat(form.premium) : null,
      support_contact: form.support_contact || null,
      notes: form.notes || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateInsurancePolicy(userId: string, id: string, form: Partial<InsurancePolicyFormData>): Promise<InsurancePolicy> {
  if (isLocalStore()) {
    const list = await getInsurancePolicies(userId);
    const idx = list.findIndex(p => p.id === id);
    if (idx === -1) throw new Error('Policy not found');
    const cur = list[idx];
    list[idx] = {
      ...cur,
      provider: form.provider !== undefined ? form.provider : cur.provider,
      policy_number: form.policy_number !== undefined ? form.policy_number : cur.policy_number,
      plan_name: form.plan_name !== undefined ? form.plan_name : cur.plan_name,
      sum_insured: form.sum_insured !== undefined ? (form.sum_insured ? parseFloat(form.sum_insured) : null) : cur.sum_insured,
      valid_from: form.valid_from !== undefined ? form.valid_from : cur.valid_from,
      valid_until: form.valid_until !== undefined ? form.valid_until : cur.valid_until,
      premium: form.premium !== undefined ? (form.premium ? parseFloat(form.premium) : null) : cur.premium,
      support_contact: form.support_contact !== undefined ? form.support_contact : cur.support_contact,
      notes: form.notes !== undefined ? form.notes : cur.notes,
      updated_at: new Date().toISOString(),
    };
    setLocal(`policies_${userId}`, list);
    return list[idx];
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (form.provider !== undefined) update.provider = form.provider;
  if (form.policy_number !== undefined) update.policy_number = form.policy_number;
  if (form.plan_name !== undefined) update.plan_name = form.plan_name || null;
  if (form.sum_insured !== undefined) update.sum_insured = form.sum_insured ? parseFloat(form.sum_insured) : null;
  if (form.valid_from !== undefined) update.valid_from = form.valid_from || null;
  if (form.valid_until !== undefined) update.valid_until = form.valid_until || null;
  if (form.premium !== undefined) update.premium = form.premium ? parseFloat(form.premium) : null;
  if (form.support_contact !== undefined) update.support_contact = form.support_contact || null;
  if (form.notes !== undefined) update.notes = form.notes || null;

  const { data, error } = await supabase
    .from('insurance_policies')
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteInsurancePolicy(userId: string, id: string): Promise<void> {
  if (isLocalStore()) {
    const list = await getInsurancePolicies(userId);
    setLocal(`policies_${userId}`, list.filter(p => p.id !== id));
    return;
  }

  const { error } = await supabase.from('insurance_policies').delete().eq('id', id);
  if (error) throw error;
}

export async function getInsuranceMembers(userId: string, policyId: string): Promise<InsuranceMember[]> {
  if (isLocalStore()) {
    const list = getLocal<InsuranceMember[]>(`members_${policyId}`, userId.includes('demo') ? SEED_MEMBERS : []);
    return list;
  }

  const { data, error } = await supabase
    .from('insurance_members')
    .select('*')
    .eq('policy_id', policyId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function addInsuranceMember(userId: string, policyId: string, name: string, relationship: string): Promise<InsuranceMember> {
  if (isLocalStore()) {
    const list = await getInsuranceMembers(userId, policyId);
    const newMember: InsuranceMember = {
      id: 'mem-' + Date.now(),
      user_id: userId,
      policy_id: policyId,
      member_name: name,
      relationship,
      created_at: new Date().toISOString(),
    };
    list.push(newMember);
    setLocal(`members_${policyId}`, list);
    return newMember;
  }

  const { data, error } = await supabase
    .from('insurance_members')
    .insert({ user_id: userId, policy_id: policyId, member_name: name, relationship })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeInsuranceMember(policyId: string, id: string): Promise<void> {
  if (isLocalStore()) {
    const list = getLocal<InsuranceMember[]>(`members_${policyId}`, []);
    setLocal(`members_${policyId}`, list.filter(m => m.id !== id));
    return;
  }

  const { error } = await supabase.from('insurance_members').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// Consultations
// ============================================================
export async function getConsultations(userId: string): Promise<Consultation[]> {
  if (isLocalStore()) {
    return getLocal<Consultation[]>(`consultations_${userId}`, userId.includes('demo') ? SEED_CONSULTATIONS : []);
  }

  const { data, error } = await supabase
    .from('consultations')
    .select('*')
    .eq('user_id', userId)
    .order('consultation_date', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createConsultation(userId: string, form: ConsultationFormData): Promise<Consultation> {
  if (isLocalStore()) {
    const list = await getConsultations(userId);
    const newCon: Consultation = {
      id: 'con-' + Date.now(),
      user_id: userId,
      doctor_name: form.doctor_name,
      specialty: form.specialty || null,
      hospital_name: form.hospital_name || null,
      consultation_date: form.consultation_date,
      reason: form.reason || null,
      notes: form.notes || null,
      follow_up_date: form.follow_up_date || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    list.unshift(newCon);
    setLocal(`consultations_${userId}`, list);
    return newCon;
  }

  const { data, error } = await supabase
    .from('consultations')
    .insert({
      user_id: userId,
      doctor_name: form.doctor_name,
      specialty: form.specialty || null,
      hospital_name: form.hospital_name || null,
      consultation_date: form.consultation_date,
      reason: form.reason || null,
      notes: form.notes || null,
      follow_up_date: form.follow_up_date || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateConsultation(userId: string, id: string, form: Partial<ConsultationFormData>): Promise<Consultation> {
  if (isLocalStore()) {
    const list = await getConsultations(userId);
    const idx = list.findIndex(c => c.id === id);
    if (idx === -1) throw new Error('Consultation not found');
    list[idx] = { ...list[idx], ...form, updated_at: new Date().toISOString() };
    setLocal(`consultations_${userId}`, list);
    return list[idx];
  }

  const { data, error } = await supabase
    .from('consultations')
    .update({ ...blanksToNull(form), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteConsultation(userId: string, id: string): Promise<void> {
  if (isLocalStore()) {
    const list = await getConsultations(userId);
    setLocal(`consultations_${userId}`, list.filter(c => c.id !== id));
    return;
  }

  const { error } = await supabase.from('consultations').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// Medical Documents
// ============================================================
export async function getMedicalDocuments(userId: string): Promise<MedicalDocument[]> {
  if (isLocalStore()) {
    return getLocal<MedicalDocument[]>(`documents_${userId}`, userId.includes('demo') ? SEED_DOCUMENTS : []);
  }

  const { data, error } = await supabase
    .from('medical_documents')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getConsultationDocuments(userId: string, consultationId: string): Promise<MedicalDocument[]> {
  const docs = await getMedicalDocuments(userId);
  return docs.filter(d => d.consultation_id === consultationId);
}

// In-memory cache for offline/local document blobs
const localBlobMap = new Map<string, Blob>();

export function getLocalDocumentBlob(key: string): Blob | undefined {
  return localBlobMap.get(key);
}

export async function uploadMedicalDocument(
  userId: string,
  file: File,
  form: DocumentUploadFormData
): Promise<MedicalDocument> {
  if (isLocalStore()) {
    const list = await getMedicalDocuments(userId);
    const docId = 'doc-' + Date.now();
    localBlobMap.set(docId, file);
    localBlobMap.set(file.name, file);
    const fakeUrl = URL.createObjectURL(file);
    localBlobMap.set(fakeUrl, file);

    const newDoc: MedicalDocument = {
      id: docId,
      user_id: userId,
      consultation_id: form.consultation_id || null,
      document_type: form.document_type,
      title: form.title,
      file_path: fakeUrl,
      file_name: file.name,
      file_type: file.type,
      document_date: form.document_date || null,
      hospital_name: form.hospital_name || null,
      description: form.description || null,
      extraction_status: 'completed',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    list.unshift(newDoc);
    setLocal(`documents_${userId}`, list);
    return newDoc;
  }

  const ext = file.name.split('.').pop();
  const filePath = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('medical-documents')
    .upload(filePath, file);
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('medical_documents')
    .insert({
      user_id: userId,
      consultation_id: form.consultation_id || null,
      document_type: form.document_type,
      title: form.title,
      file_path: filePath,
      file_name: file.name,
      file_type: file.type,
      document_date: form.document_date || null,
      hospital_name: form.hospital_name || null,
      description: form.description || null,
      extraction_status: 'pending',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateDocumentMetadata(
  userId: string,
  id: string,
  updates: Partial<DocumentUploadFormData & { extraction_status: ExtractionStatus }>
): Promise<MedicalDocument> {
  if (isLocalStore()) {
    const list = await getMedicalDocuments(userId);
    const idx = list.findIndex(d => d.id === id);
    if (idx === -1) throw new Error('Document not found');
    list[idx] = { ...list[idx], ...updates, updated_at: new Date().toISOString() };
    setLocal(`documents_${userId}`, list);
    return list[idx];
  }

  const { data, error } = await supabase
    .from('medical_documents')
    .update({ ...blanksToNull(updates), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMedicalDocument(userId: string, id: string, filePath: string): Promise<void> {
  if (isLocalStore()) {
    const list = await getMedicalDocuments(userId);
    setLocal(`documents_${userId}`, list.filter(d => d.id !== id));
    return;
  }

  await supabase.storage.from('medical-documents').remove([filePath]);
  const { error } = await supabase.from('medical_documents').delete().eq('id', id);
  if (error) throw error;
}

export async function getDocumentSignedUrl(filePath: string): Promise<string> {
  if (localBlobMap.has(filePath)) {
    return URL.createObjectURL(localBlobMap.get(filePath)!);
  }
  if (isLocalStore() || filePath.startsWith('blob:') || filePath.startsWith('http')) {
    return filePath;
  }
  const { data, error } = await supabase.storage
    .from('medical-documents')
    .createSignedUrl(filePath, 300);
  if (error) throw error;
  return data.signedUrl;
}

// ============================================================
// Reminders
// ============================================================
export async function getReminders(userId: string): Promise<Reminder[]> {
  if (isLocalStore()) {
    return getLocal<Reminder[]>(`reminders_${userId}`, userId.includes('demo') ? SEED_REMINDERS : []);
  }

  const { data, error } = await supabase
    .from('reminders')
    .select('*')
    .eq('user_id', userId)
    .order('due_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createReminder(userId: string, form: ReminderFormData): Promise<Reminder> {
  const dueAt = form.due_time
    ? `${form.due_date}T${form.due_time}:00`
    : `${form.due_date}T09:00:00`;

  if (isLocalStore()) {
    const list = await getReminders(userId);
    const newRem: Reminder = {
      id: 'rem-' + Date.now(),
      user_id: userId,
      title: form.title,
      type: form.type,
      due_at: dueAt,
      timezone: form.timezone || 'Asia/Kolkata',
      recurrence_rule: form.recurrence_rule || null,
      status: 'upcoming',
      notes: form.notes || null,
      related_record_id: form.related_record_id || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    list.push(newRem);
    setLocal(`reminders_${userId}`, list);
    return newRem;
  }

  const { data, error } = await supabase
    .from('reminders')
    .insert({
      user_id: userId,
      title: form.title,
      type: form.type,
      due_at: dueAt,
      timezone: form.timezone || null,
      recurrence_rule: form.recurrence_rule || null,
      status: 'upcoming',
      notes: form.notes || null,
      related_record_id: form.related_record_id || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateReminder(
  userId: string,
  id: string,
  updates: Partial<ReminderFormData & { status: string }>
): Promise<Reminder> {
  if (isLocalStore()) {
    const list = await getReminders(userId);
    const idx = list.findIndex(r => r.id === id);
    if (idx === -1) throw new Error('Reminder not found');
    const cur = list[idx];
    let dueAt = cur.due_at;
    if (updates.due_date || updates.due_time) {
      const datePart = updates.due_date || cur.due_at.split('T')[0];
      const timePart = updates.due_time || cur.due_at.split('T')[1]?.slice(0, 5) || '09:00';
      dueAt = `${datePart}T${timePart}:00`;
    }
    list[idx] = {
      ...cur,
      title: updates.title !== undefined ? updates.title : cur.title,
      type: updates.type !== undefined ? updates.type : cur.type,
      due_at: dueAt,
      status: (updates.status !== undefined ? updates.status : cur.status) as Reminder['status'],
      notes: updates.notes !== undefined ? updates.notes : cur.notes,
      recurrence_rule: updates.recurrence_rule !== undefined ? updates.recurrence_rule : cur.recurrence_rule,
      updated_at: new Date().toISOString(),
    };
    setLocal(`reminders_${userId}`, list);
    return list[idx];
  }

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.title !== undefined) payload.title = updates.title;
  if (updates.type !== undefined) payload.type = updates.type;
  if (updates.due_date !== undefined || updates.due_time !== undefined) {
    const dueDate = updates.due_date;
    const dueTime = updates.due_time || '09:00';
    if (dueDate) payload.due_at = `${dueDate}T${dueTime}:00`;
  }
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.notes !== undefined) payload.notes = updates.notes || null;
  if (updates.recurrence_rule !== undefined) payload.recurrence_rule = updates.recurrence_rule || null;

  const { data, error } = await supabase
    .from('reminders')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteReminder(userId: string, id: string): Promise<void> {
  if (isLocalStore()) {
    const list = await getReminders(userId);
    setLocal(`reminders_${userId}`, list.filter(r => r.id !== id));
    return;
  }

  const { error } = await supabase.from('reminders').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// Subscriptions
// ============================================================
// Prices, durations and statuses are decided by the database functions in
// migration 20261119000000_membership_plans.sql. The browser only says which
// plan the signed-in user wants; it never sends an amount, an expiry or a user id.

function localSubs(userId: string): Subscription[] {
  // The demo account keeps a sample active yearly membership at the current price.
  const demo: Subscription[] = userId.includes('demo')
    ? [{
        id: 'sub-demo-1',
        user_id: userId,
        plan: 'yearly',
        status: 'active',
        amount: PLAN_PRICES.yearly,
        currency: 'INR',
        provider_reference: 'DEMO-REFERENCE',
        period_start: '2026-01-01T00:00:00.000Z',
        period_end: planPeriodEnd(new Date('2026-01-01T00:00:00.000Z'), 'yearly').toISOString(),
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      }]
    : [];
  const stored = getLocal<Subscription[] | Subscription | null>(`subs_${userId}`, demo);
  return Array.isArray(stored) ? stored : stored ? [stored] : [];
}

/** All of the signed-in user's subscription rows (RLS limits them to the user). */
export async function getSubscriptions(userId: string): Promise<Subscription[]> {
  if (isLocalStore()) return localSubs(userId);
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as Subscription[];
}

export async function getMembership(userId: string): Promise<MembershipState> {
  return membershipState(await getSubscriptions(userId));
}

/** The subscription currently granting access, if any. */
export async function getSubscription(userId: string): Promise<Subscription | null> {
  return (await getMembership(userId)).current;
}

/** Maps database errors to messages users can act on. */
function subscriptionError(err: unknown): Error {
  const msg = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : String(err);
  if (/trial_already_used/.test(msg)) return new Error('You have already used your free trial.');
  if (/already_subscribed/.test(msg)) return new Error('You already have an active membership.');
  if (/invalid_plan/.test(msg)) return new Error('That plan is not available.');
  if (/not_authenticated|JWT|permission denied/i.test(msg)) return new Error('Please sign in again to continue.');
  return new Error('Something went wrong. Please try again.');
}

/** Starts the one-time 24-hour free trial for the signed-in user. */
export async function startFreeTrial(userId: string): Promise<Subscription> {
  if (isLocalStore()) {
    // Offline/local mode: same rules, kept in this browser only (not tamper-proof).
    const subs = localSubs(userId);
    const state = membershipState(subs);
    if (state.trialUsed) throw new Error('You have already used your free trial.');
    if (state.current?.status === 'active') throw new Error('You already have an active membership.');
    const now = new Date();
    const sub: Subscription = {
      id: 'sub-trial-' + now.getTime(),
      user_id: userId,
      plan: 'trial',
      status: 'trial',
      amount: 0,
      currency: 'INR',
      provider_reference: null,
      period_start: now.toISOString(),
      period_end: planPeriodEnd(now, 'trial').toISOString(),
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
    setLocal(`subs_${userId}`, [sub, ...subs]);
    return sub;
  }
  const { data, error } = await supabase.rpc('start_free_trial');
  if (error) throw subscriptionError(error);
  return data as Subscription;
}

/**
 * Records that the user wants a paid plan. The row stays 'pending' (no access)
 * until a trusted backend verifies the payment and calls activate_subscription().
 */
export async function requestSubscription(userId: string, plan: 'monthly' | 'yearly'): Promise<Subscription> {
  if (isLocalStore()) {
    const subs = localSubs(userId);
    const open = subs.find(s => s.plan === plan && s.status === 'pending');
    if (open) return open;
    const now = new Date();
    const sub: Subscription = {
      id: 'sub-' + now.getTime(),
      user_id: userId,
      plan,
      status: 'pending',
      amount: PLAN_PRICES[plan],
      currency: 'INR',
      provider_reference: null,
      period_start: now.toISOString(),
      period_end: planPeriodEnd(now, plan).toISOString(),
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
    setLocal(`subs_${userId}`, [sub, ...subs]);
    return sub;
  }
  const { data, error } = await supabase.rpc('request_subscription', { p_plan: plan });
  if (error) throw subscriptionError(error);
  return data as Subscription;
}

// ============================================================
// Lab Results
// ============================================================
export async function getLabResults(userId: string): Promise<LabResult[]> {
  if (isLocalStore()) {
    return getLocal<LabResult[]>(`lab_results_${userId}`, userId.includes('demo') ? SEED_LAB_RESULTS : []);
  }

  const { data, error } = await supabase
    .from('lab_results')
    .select('*')
    .eq('user_id', userId)
    .order('test_date', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createLabResult(
  userId: string,
  form: Partial<LabResultFormData> & { medical_document_id?: string | null }
): Promise<LabResult> {
  if (isLocalStore()) {
    const list = await getLabResults(userId);
    const newLab: LabResult = {
      id: 'lab-' + Date.now(),
      user_id: userId,
      medical_document_id: form.medical_document_id || null,
      test_name: form.test_name || 'Lab Test',
      result_value: form.result_value || '',
      unit: form.unit || null,
      reference_range: form.reference_range || null,
      result_status: (form.result_status as LabResult['result_status']) || 'normal',
      test_date: form.test_date || null,
      source_hospital: form.source_hospital || null,
      notes: form.notes || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    list.unshift(newLab);
    setLocal(`lab_results_${userId}`, list);
    return newLab;
  }

  const { data, error } = await supabase
    .from('lab_results')
    .insert({
      user_id: userId,
      medical_document_id: form.medical_document_id || null,
      test_name: form.test_name,
      result_value: form.result_value,
      unit: form.unit || null,
      reference_range: form.reference_range || null,
      result_status: form.result_status || 'normal',
      test_date: form.test_date || null,
      source_hospital: form.source_hospital || null,
      notes: form.notes || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteLabResult(userId: string, id: string): Promise<void> {
  if (isLocalStore()) {
    const list = await getLabResults(userId);
    setLocal(`lab_results_${userId}`, list.filter(l => l.id !== id));
    return;
  }

  const { error } = await supabase.from('lab_results').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// Document Extractions History
// ============================================================
export async function getDocumentExtractions(userId: string): Promise<DocumentExtraction[]> {
  if (isLocalStore()) {
    return getLocal<DocumentExtraction[]>(`extractions_${userId}`, []);
  }

  const { data, error } = await supabase
    .from('document_extractions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function saveDocumentExtraction(
  userId: string,
  extraction: Partial<DocumentExtraction> & { medical_document_id: string }
): Promise<DocumentExtraction> {
  if (isLocalStore()) {
    const list = await getDocumentExtractions(userId);
    const newExt: DocumentExtraction = {
      id: 'ext-' + Date.now(),
      user_id: userId,
      medical_document_id: extraction.medical_document_id,
      status: extraction.status || 'completed',
      extracted_data: extraction.extracted_data || null,
      warnings: extraction.warnings || [],
      extractor_version: extraction.extractor_version || '1.0.0',
      processed_at: extraction.processed_at || new Date().toISOString(),
      reviewed_at: extraction.reviewed_at || null,
      applied_at: extraction.applied_at || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    list.unshift(newExt);
    setLocal(`extractions_${userId}`, list);
    return newExt;
  }

  const { data, error } = await supabase
    .from('document_extractions')
    .insert({
      user_id: userId,
      medical_document_id: extraction.medical_document_id,
      status: extraction.status || 'completed',
      extracted_data: extraction.extracted_data || null,
      warnings: extraction.warnings || [],
      extractor_version: extraction.extractor_version || '1.0.0',
      processed_at: extraction.processed_at || new Date().toISOString(),
      reviewed_at: extraction.reviewed_at || null,
      applied_at: extraction.applied_at || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateDocumentExtraction(
  userId: string,
  id: string,
  updates: Partial<DocumentExtraction>
): Promise<DocumentExtraction> {
  if (isLocalStore()) {
    const list = await getDocumentExtractions(userId);
    const idx = list.findIndex(e => e.id === id);
    if (idx === -1) throw new Error('Extraction record not found');
    list[idx] = { ...list[idx], ...updates, updated_at: new Date().toISOString() };
    setLocal(`extractions_${userId}`, list);
    return list[idx];
  }

  const { data, error } = await supabase
    .from('document_extractions')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ============================================================
// Medical Record Sources (Traceability)
// ============================================================
export async function createMedicalRecordSource(
  userId: string,
  source: Omit<MedicalRecordSource, 'id' | 'created_at' | 'user_id'>
): Promise<MedicalRecordSource> {
  if (isLocalStore()) {
    const list = getLocal<MedicalRecordSource[]>(`sources_${userId}`, []);
    const newSrc: MedicalRecordSource = {
      id: 'src-' + Date.now(),
      user_id: userId,
      ...source,
      created_at: new Date().toISOString(),
    };
    list.push(newSrc);
    setLocal(`sources_${userId}`, list);
    return newSrc;
  }

  const { data, error } = await supabase
    .from('medical_record_sources')
    .insert({
      user_id: userId,
      medical_document_id: source.medical_document_id,
      record_type: source.record_type,
      record_id: source.record_id,
      source_page: source.source_page || null,
      source_excerpt: source.source_excerpt || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getMedicalRecordSources(
  userId: string,
  recordType?: string,
  recordId?: string
): Promise<MedicalRecordSource[]> {
  if (isLocalStore()) {
    const list = getLocal<MedicalRecordSource[]>(`sources_${userId}`, []);
    return list.filter(s => {
      if (recordType && s.record_type !== recordType) return false;
      if (recordId && s.record_id !== recordId) return false;
      return true;
    });
  }

  let query = supabase.from('medical_record_sources').select('*').eq('user_id', userId);
  if (recordType) query = query.eq('record_type', recordType);
  if (recordId) query = query.eq('record_id', recordId);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// ============================================================
// Dashboard Summary
// ============================================================
export async function getDashboardSummary(userId: string) {
  const [meds, allergies, consultations, documents, policies, reminders, labs] = await Promise.all([
    getMedications(userId),
    getAllergies(userId),
    getConsultations(userId),
    getMedicalDocuments(userId),
    getInsurancePolicies(userId),
    getReminders(userId),
    getLabResults(userId),
  ]);

  const upcomingReminders = reminders.filter(
    r => r.status === 'upcoming'
  );

  return {
    totalMedications: meds.length,
    activeMedications: meds.filter(m => m.status === 'active').length,
    totalAllergies: allergies.length,
    totalConsultations: consultations.length,
    totalDocuments: documents.length,
    totalInsurancePolicies: policies.length,
    upcomingReminders: upcomingReminders.length,
    totalLabResults: labs.length,
    medications: meds.slice(0, 5),
    allergies: allergies.slice(0, 5),
    consultations: consultations.slice(0, 5),
    reminders: upcomingReminders.slice(0, 5),
    policies: policies.slice(0, 3),
    labResults: labs.slice(0, 5),
  };
}
