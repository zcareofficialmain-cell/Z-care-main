// ============================================================
// ZCare Medical Data Matcher
// Compares extracted medical records against existing patient data
// Detects exact duplicates, potential duplicates, conflicts, and new records
// ============================================================

import type {
  Medication,
  Allergy,
  Consultation,
  Reminder,
} from '@/types';
import type {
  ExtractedMedication,
  ExtractedAllergy,
  ExtractedDoctorInfo,
  ExtractedLabResult,
  ExtractedFollowUp,
  ExtractedDiagnosis,
  ExtractedProcedure,
  MedicalExtractionResult,
  ReviewItem,
  LabResult,
} from '@/types/medicalExtraction';

export interface ExistingPatientData {
  medications: Medication[];
  allergies: Allergy[];
  consultations: Consultation[];
  reminders: Reminder[];
  labResults: LabResult[];
}

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

// Helpers
function normalizeText(text: string | null | undefined): string {
  if (!text) return '';
  return text.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Compare extracted items with existing records and return interactive review items
 */
export function matchExtractedData(
  extracted: MedicalExtractionResult,
  existing: ExistingPatientData
): MatchedExtractionReview {
  let newItems = 0;
  let duplicateItems = 0;
  let conflictingItems = 0;

  // 1. Match Medications
  const reviewedMeds: ReviewItem<ExtractedMedication>[] = extracted.medications.map((item, index) => {
    const normName = normalizeText(item.name);
    const normStrength = normalizeText(item.strength);

    const existingMatch = existing.medications.find(m => {
      const exNorm = normalizeText(m.name);
      return exNorm === normName || exNorm.includes(normName) || normName.includes(exNorm);
    });

    let matchType: 'exact_duplicate' | 'potential_duplicate' | 'conflict' | 'new' = 'new';
    let conflictDesc: string | undefined;
    let existingSummary: string | undefined;

    if (existingMatch) {
      existingSummary = `${existingMatch.name} ${existingMatch.strength || ''} (${existingMatch.status})`;
      const existingStrengthNorm = normalizeText(existingMatch.strength);

      if (normStrength && existingStrengthNorm && normStrength !== existingStrengthNorm) {
        matchType = 'conflict';
        conflictDesc = `Dosage conflict: Extracted has "${item.strength || 'unspecified'}" while existing record is "${existingMatch.strength}".`;
        conflictingItems++;
      } else if (existingMatch.status === 'active' && item.status_hint === 'discontinued') {
        matchType = 'conflict';
        conflictDesc = `Status conflict: Currently active in your profile, but marked discontinued in this report.`;
        conflictingItems++;
      } else {
        matchType = 'exact_duplicate';
        duplicateItems++;
      }
    } else {
      newItems++;
    }

    return {
      id: `med-extract-${index}-${Date.now()}`,
      category: 'medication',
      data: item,
      status: matchType === 'exact_duplicate' ? 'rejected' : matchType === 'conflict' ? 'conflict' : 'accepted',
      match_info: {
        match_type: matchType,
        existing_record_id: existingMatch?.id,
        existing_record_summary: existingSummary,
        conflict_description: conflictDesc,
      },
    };
  });

  // 2. Match Allergies
  const reviewedAllergies: ReviewItem<ExtractedAllergy>[] = extracted.allergies.map((item, index) => {
    const normAllergen = normalizeText(item.allergen);

    const existingMatch = existing.allergies.find(a => {
      const exNorm = normalizeText(a.allergen);
      return exNorm === normAllergen || exNorm.includes(normAllergen) || normAllergen.includes(exNorm);
    });

    let matchType: 'exact_duplicate' | 'potential_duplicate' | 'conflict' | 'new' = 'new';
    let conflictDesc: string | undefined;
    let existingSummary: string | undefined;

    if (existingMatch) {
      existingSummary = `${existingMatch.allergen} (${existingMatch.severity}, ${existingMatch.verification_status})`;
      if (item.severity && item.severity !== existingMatch.severity) {
        matchType = 'conflict';
        conflictDesc = `Severity mismatch: Extracted "${item.severity}", existing is "${existingMatch.severity}".`;
        conflictingItems++;
      } else {
        matchType = 'exact_duplicate';
        duplicateItems++;
      }
    } else {
      newItems++;
    }

    return {
      id: `alg-extract-${index}-${Date.now()}`,
      category: 'allergy',
      data: item,
      status: matchType === 'exact_duplicate' ? 'rejected' : matchType === 'conflict' ? 'conflict' : 'accepted',
      match_info: {
        match_type: matchType,
        existing_record_id: existingMatch?.id,
        existing_record_summary: existingSummary,
        conflict_description: conflictDesc,
      },
    };
  });

  // 3. Match Doctor Consultations
  const reviewedDoctors: ReviewItem<ExtractedDoctorInfo>[] = extracted.doctors.map((item, index) => {
    const normDoctor = normalizeText(item.doctor_name);
    const consultDate = item.consultation_date || extracted.patient_info.consultation_date || extracted.patient_info.report_date;

    const existingMatch = existing.consultations.find(c => {
      const docNorm = normalizeText(c.doctor_name);
      const sameDoc = docNorm === normDoctor || docNorm.includes(normDoctor) || normDoctor.includes(docNorm);
      const sameDate = consultDate && c.consultation_date === consultDate;
      return sameDoc && sameDate;
    });

    let matchType: 'exact_duplicate' | 'potential_duplicate' | 'conflict' | 'new' = 'new';
    let existingSummary: string | undefined;

    if (existingMatch) {
      matchType = 'exact_duplicate';
      existingSummary = `${existingMatch.doctor_name} on ${existingMatch.consultation_date}`;
      duplicateItems++;
    } else {
      newItems++;
    }

    return {
      id: `doc-extract-${index}-${Date.now()}`,
      category: 'doctor',
      data: {
        ...item,
        consultation_date: consultDate,
        hospital_name: item.hospital_name || extracted.patient_info.hospital_name,
      },
      status: matchType === 'exact_duplicate' ? 'rejected' : 'accepted',
      match_info: {
        match_type: matchType,
        existing_record_id: existingMatch?.id,
        existing_record_summary: existingSummary,
      },
    };
  });

  // 4. Match Lab Results
  const reviewedLabs: ReviewItem<ExtractedLabResult>[] = extracted.lab_results.map((item, index) => {
    const normTest = normalizeText(item.test_name);
    const testDate = item.test_date || extracted.patient_info.report_date;

    const existingMatch = existing.labResults.find(l => {
      const matchName = normalizeText(l.test_name) === normTest;
      const matchDate = testDate ? l.test_date === testDate : true;
      return matchName && matchDate;
    });

    let matchType: 'exact_duplicate' | 'potential_duplicate' | 'conflict' | 'new' = 'new';
    let existingSummary: string | undefined;
    let conflictDesc: string | undefined;

    if (existingMatch) {
      existingSummary = `${existingMatch.test_name}: ${existingMatch.result_value} ${existingMatch.unit || ''} (${existingMatch.test_date || 'Undated'})`;
      if (existingMatch.result_value !== item.result_value) {
        matchType = 'conflict';
        conflictDesc = `Existing value is ${existingMatch.result_value} ${existingMatch.unit || ''}; extracted is ${item.result_value} ${item.unit || ''}.`;
        conflictingItems++;
      } else {
        matchType = 'exact_duplicate';
        duplicateItems++;
      }
    } else {
      newItems++;
    }

    return {
      id: `lab-extract-${index}-${Date.now()}`,
      category: 'lab_result',
      data: {
        ...item,
        test_date: testDate,
        source_hospital: item.source_hospital || extracted.patient_info.hospital_name,
      },
      status: matchType === 'exact_duplicate' ? 'rejected' : matchType === 'conflict' ? 'conflict' : 'accepted',
      match_info: {
        match_type: matchType,
        existing_record_id: existingMatch?.id,
        existing_record_summary: existingSummary,
        conflict_description: conflictDesc,
      },
    };
  });

  // 5. Match Follow-Ups (Reminders)
  const reviewedFollowUps: ReviewItem<ExtractedFollowUp>[] = extracted.follow_ups.map((item, index) => {
    const dueDate = item.follow_up_date;
    const existingMatch = existing.reminders.find(r => {
      const exDate = r.due_at ? r.due_at.split('T')[0] : '';
      return exDate === dueDate && r.type === item.type;
    });

    let matchType: 'exact_duplicate' | 'potential_duplicate' | 'conflict' | 'new' = 'new';
    let existingSummary: string | undefined;

    if (existingMatch) {
      matchType = 'exact_duplicate';
      existingSummary = `${existingMatch.title} on ${dueDate}`;
      duplicateItems++;
    } else {
      newItems++;
    }

    return {
      id: `rem-extract-${index}-${Date.now()}`,
      category: 'follow_up',
      data: item,
      status: matchType === 'exact_duplicate' ? 'rejected' : 'accepted',
      match_info: {
        match_type: matchType,
        existing_record_id: existingMatch?.id,
        existing_record_summary: existingSummary,
      },
    };
  });

  // 6. Diagnoses
  const reviewedDiagnoses: ReviewItem<ExtractedDiagnosis>[] = extracted.diagnoses.map((item, index) => {
    newItems++;
    return {
      id: `diag-extract-${index}-${Date.now()}`,
      category: 'diagnosis',
      data: item,
      status: 'accepted',
      match_info: { match_type: 'new' },
    };
  });

  // 7. Procedures
  const reviewedProcedures: ReviewItem<ExtractedProcedure>[] = extracted.procedures.map((item, index) => {
    newItems++;
    return {
      id: `proc-extract-${index}-${Date.now()}`,
      category: 'procedure',
      data: item,
      status: 'accepted',
      match_info: { match_type: 'new' },
    };
  });

  const totalItems =
    reviewedMeds.length +
    reviewedAllergies.length +
    reviewedDoctors.length +
    reviewedLabs.length +
    reviewedFollowUps.length +
    reviewedDiagnoses.length +
    reviewedProcedures.length;

  return {
    medications: reviewedMeds,
    allergies: reviewedAllergies,
    doctors: reviewedDoctors,
    lab_results: reviewedLabs,
    follow_ups: reviewedFollowUps,
    diagnoses: reviewedDiagnoses,
    procedures: reviewedProcedures,
    summary: {
      totalItems,
      newItems,
      duplicateItems,
      conflictingItems,
    },
  };
}

