// ============================================================
// ZCare Medical Profile Updater
// Applies confirmed extracted medical records to database
// Creates medications, allergies, consultations, lab results,
// reminders, and source provenance links.
// ============================================================

import {
  createMedication,
  createAllergy,
  createConsultation,
  createLabResult,
  createReminder,
  updateDocumentMetadata,
  updateDocumentExtraction,
  createMedicalRecordSource,
} from '@/services/api';
import type {
  MatchedExtractionReview,
  ApplyExtractionResult,
  DocumentExtraction,
  ReviewItem,
  ExtractedDiagnosis,
} from '@/types/medicalExtraction';
import type { MedicalDocument, MedicationFormData, AllergyFormData, ConsultationFormData, ReminderFormData } from '@/types';
import {
  validateMedicationCandidate,
  validateAllergyCandidate,
} from './medicalValidator.ts';

export async function applyConfirmedExtraction(
  userId: string,
  document: MedicalDocument,
  extractionRecordId: string | null,
  reviewData: MatchedExtractionReview
): Promise<ApplyExtractionResult> {
  const result: ApplyExtractionResult = {
    medications_created: 0,
    allergies_created: 0,
    consultations_created: 0,
    lab_results_created: 0,
    reminders_created: 0,
    diagnoses_stored: 0,
    conflicts_skipped: 0,
    duplicates_skipped: 0,
    errors: [],
  };

  const docDate = document.document_date || new Date().toISOString().split('T')[0];

  // 1. Apply Approved Medications
  for (const item of reviewData.medications) {
    if (item.status === 'rejected') {
      if (item.match_info?.match_type === 'exact_duplicate') {
        result.duplicates_skipped++;
      }
      continue;
    }
    if (item.status === 'conflict') {
      result.conflicts_skipped++;
      continue;
    }

    try {
      const data = { ...item.data, ...(item.edited_data || {}) };

      // Field-level clinical validation safety check
      const medVal = validateMedicationCandidate({
        name: data.name,
        strength: data.strength,
        dose: data.dose,
        route: data.route,
        frequency: data.frequency,
        instructions: data.instructions,
      });
      if (!medVal.isValid) {
        result.errors.push(`Validation rejected candidate "${data.name}": ${medVal.rejectionReason}`);
        continue;
      }

      const formData: MedicationFormData = {
        name: medVal.value!.name,
        strength: medVal.value!.strength || '',
        dose: medVal.value!.dose || '',
        route: medVal.value!.route || 'oral',
        frequency: medVal.value!.frequency || 'Daily',
        instructions: medVal.value!.instructions || '',
        start_date: data.start_date || docDate,
        end_date: data.end_date || '',
        status: data.status_hint === 'discontinued' ? 'discontinued' : 'active',
        notes: `Extracted from ${document.title}.${data.duration ? ` Duration: ${data.duration}.` : ''} ${data.prescribing_doctor ? `Prescribed by: ${data.prescribing_doctor}` : ''}`.trim(),
      };

      const newMed = await createMedication(userId, formData);
      result.medications_created++;

      // Create provenance source link
      await createMedicalRecordSource(userId, {
        medical_document_id: document.id,
        record_type: 'medication',
        record_id: newMed.id,
        source_page: data.source_page || 1,
        source_excerpt: data.source_excerpt || data.name,
      });
    } catch (err: any) {
      console.error('Error applying medication:', err);
      result.errors.push(`Failed to save medication ${item.data.name}: ${err.message || 'Unknown error'}`);
    }
  }

  // 2. Apply Approved Allergies
  for (const item of reviewData.allergies) {
    if (item.status === 'rejected') {
      if (item.match_info?.match_type === 'exact_duplicate') {
        result.duplicates_skipped++;
      }
      continue;
    }
    if (item.status === 'conflict') {
      result.conflicts_skipped++;
      continue;
    }

    try {
      const data = { ...item.data, ...(item.edited_data || {}) };

      // Field-level clinical validation safety check
      const algVal = validateAllergyCandidate({
        allergen: data.allergen,
        reaction: data.reaction,
        severity: data.severity,
        source: data.source === 'clinician-confirmed' ? 'clinician-confirmed' : 'patient-reported',
      });
      if (!algVal.isValid) {
        result.errors.push(`Validation rejected candidate "${data.allergen}": ${algVal.rejectionReason}`);
        continue;
      }

      const formData: AllergyFormData = {
        allergen: algVal.value!.allergen,
        reaction: algVal.value!.reaction || '',
        severity: algVal.value!.severity || 'moderate',
        first_noted_at: data.date_reported || data.source_document_date || docDate,
        source: algVal.value!.source || 'patient-reported',
        verification_status: 'patient-reported', // NEVER automatically clinician-confirmed
        notes: `Identified from uploaded medical record: ${document.title}`,
      };

      const newAllergy = await createAllergy(userId, formData);
      result.allergies_created++;

      await createMedicalRecordSource(userId, {
        medical_document_id: document.id,
        record_type: 'allergy',
        record_id: newAllergy.id,
        source_page: data.source_page || 1,
        source_excerpt: data.source_excerpt || data.allergen,
      });
    } catch (err: any) {
      console.error('Error applying allergy:', err);
      result.errors.push(`Failed to save allergy ${item.data.allergen}: ${err.message || 'Unknown error'}`);
    }
  }

  // 3. Apply Doctor Consultations
  let linkedConsultationId: string | null = null;
  for (const item of reviewData.doctors) {
    if (item.status === 'rejected') {
      if (item.match_info?.match_type === 'exact_duplicate') {
        result.duplicates_skipped++;
      }
      continue;
    }

    try {
      const data = { ...item.data, ...(item.edited_data || {}) };
      const consultDate = data.consultation_date || docDate;
      const diagSummary = reviewData.diagnoses
        .filter((d: ReviewItem<ExtractedDiagnosis>) => d.status === 'accepted')
        .map((d: ReviewItem<ExtractedDiagnosis>) => d.data.diagnosis)
        .join(', ');

      const formData: ConsultationFormData = {
        doctor_name: data.doctor_name,
        specialty: data.specialty || 'General Practitioner',
        hospital_name: data.hospital_name || document.hospital_name || 'Medical Centre',
        consultation_date: consultDate,
        reason: diagSummary ? `Care for: ${diagSummary}` : document.title,
        notes: `Consultation recorded via report scan: "${document.title}". Follow-up recommended: ${data.follow_up_date || 'None'}`,
        follow_up_date: data.follow_up_date || '',
      };

      const newCon = await createConsultation(userId, formData);
      result.consultations_created++;
      linkedConsultationId = newCon.id;

      await createMedicalRecordSource(userId, {
        medical_document_id: document.id,
        record_type: 'consultation',
        record_id: newCon.id,
        source_page: data.source_page || 1,
        source_excerpt: data.source_excerpt || data.doctor_name,
      });
    } catch (err: any) {
      console.error('Error applying consultation:', err);
      result.errors.push(`Failed to save consultation for ${item.data.doctor_name}: ${err.message || 'Unknown error'}`);
    }
  }

  // Link uploaded document to the new consultation if one was created
  if (linkedConsultationId) {
    try {
      await updateDocumentMetadata(userId, document.id, {
        consultation_id: linkedConsultationId,
      });
    } catch {
      // Non-fatal
    }
  }

  // 4. Apply Lab Results
  for (const item of reviewData.lab_results) {
    if (item.status === 'rejected') {
      if (item.match_info?.match_type === 'exact_duplicate') {
        result.duplicates_skipped++;
      }
      continue;
    }
    if (item.status === 'conflict') {
      result.conflicts_skipped++;
      continue;
    }

    try {
      const data = { ...item.data, ...(item.edited_data || {}) };
      const newLab = await createLabResult(userId, {
        medical_document_id: document.id,
        test_name: data.test_name,
        result_value: data.result_value,
        unit: data.unit || '',
        reference_range: data.reference_range || '',
        result_status: data.result_status || 'normal',
        test_date: data.test_date || docDate,
        source_hospital: data.source_hospital || document.hospital_name || '',
        notes: data.notes || `Extracted from ${document.title}`,
      });
      result.lab_results_created++;

      await createMedicalRecordSource(userId, {
        medical_document_id: document.id,
        record_type: 'lab_result',
        record_id: newLab.id,
        source_page: data.source_page || 1,
        source_excerpt: data.source_excerpt || `${data.test_name}: ${data.result_value}`,
      });
    } catch (err: any) {
      console.error('Error applying lab result:', err);
      result.errors.push(`Failed to save lab test ${item.data.test_name}: ${err.message || 'Unknown error'}`);
    }
  }

  // 5. Apply Follow-Up Reminders
  for (const item of reviewData.follow_ups) {
    if (item.status === 'rejected') {
      if (item.match_info?.match_type === 'exact_duplicate') {
        result.duplicates_skipped++;
      }
      continue;
    }

    try {
      const data = { ...item.data, ...(item.edited_data || {}) };
      const formData: ReminderFormData = {
        title: data.title || 'Scheduled Health Follow-up',
        type: data.type || 'follow-up',
        due_date: data.follow_up_date,
        due_time: '09:00',
        timezone: 'Asia/Kolkata',
        recurrence_rule: '',
        status: 'upcoming',
        notes: `Recommended follow-up from: ${document.title}. ${data.notes || ''}`.trim(),
        related_record_id: document.id,
      };

      const newRem = await createReminder(userId, formData);
      result.reminders_created++;

      await createMedicalRecordSource(userId, {
        medical_document_id: document.id,
        record_type: 'reminder',
        record_id: newRem.id,
        source_page: data.source_page || 1,
        source_excerpt: data.source_excerpt || data.follow_up_date,
      });
    } catch (err: any) {
      console.error('Error applying reminder:', err);
      result.errors.push(`Failed to schedule reminder on ${item.data.follow_up_date}: ${err.message || 'Unknown error'}`);
    }
  }

  // 6. Update Extraction Record Status to 'applied'
  if (extractionRecordId) {
    try {
      await updateDocumentExtraction(userId, extractionRecordId, {
        status: 'applied',
        applied_at: new Date().toISOString(),
        reviewed_at: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('Failed to update extraction record status:', err);
    }
  }

  // Update document extraction_status and synchronize hospital metadata
  try {
    const metaUpdates: any = {
      extraction_status: 'completed',
    };
    const extractedHosp = (reviewData as any).patient_info?.hospital_name;
    if (extractedHosp) {
      metaUpdates.hospital_name = extractedHosp;
    }
    const extractedDate = (reviewData as any).patient_info?.report_date;
    if (extractedDate) {
      metaUpdates.document_date = extractedDate;
    }
    await updateDocumentMetadata(userId, document.id, metaUpdates);
  } catch {
    // Non-fatal
  }

  return result;
}
