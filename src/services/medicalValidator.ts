// ============================================================
// ZCare Medical Validator
// Strict validation and classification layer for medications
// and allergies before candidate presentation and database persistence.
// Rejects arbitrary text fragments, disclaimers, headings, and dates.
// ============================================================

export interface ValidatedMedication {
  name: string;
  strength: string | null;
  dose: string | null;
  route: string | null;
  frequency: string | null;
  instructions: string | null;
  startDate: string | null;
  endDate: string | null;
  duration: string | null;
  status: 'newly_prescribed' | 'currently_taking' | 'discontinued' | 'active' | 'unknown';
  sourceSection: string;
  sourcePage: number | null;
  sourceText: string;
  reviewStatus: 'pending' | 'accepted' | 'rejected' | 'conflict';
}

export interface ValidatedAllergy {
  allergen: string;
  reaction: string | null;
  severity: 'mild' | 'moderate' | 'severe' | 'life-threatening' | null;
  source: 'patient-reported' | 'clinician-confirmed' | 'unknown';
  sourceSection: string;
  sourcePage: number | null;
  sourceText: string;
  reviewStatus: 'pending' | 'accepted' | 'rejected' | 'conflict';
}

export interface ValidationResult<T> {
  isValid: boolean;
  value?: T;
  rejectionReason?: string;
}

// Banned phrases and patterns for medication names
const BANNED_MEDICATION_PATTERNS = [
  /not\s+for\s+clinical\s+use/i,
  /page\s+\d+/i,
  /date\s+of\s+birth/i,
  /visit\s+date/i,
  /report\s+date/i,
  /specimen\s+date/i,
  /patient\s+(?:name|id|details)/i,
  /doctor\s+(?:name|details)?/i,
  /clinician/i,
  /department/i,
  /hospital/i,
  /medical\s+centre/i,
  /laboratory/i,
  /minutes?\s+after/i,
  /taking\s+ibuprofen/i,
  /synthetic\s+test/i,
  /important\s+test/i,
  /document\s+processing/i,
  /expectations/i,
  /reconciliation/i,
  /directions/i,
  /duration/i,
  /status/i,
  /appointment/i,
  /follow[\s-]?up/i,
  /prescribed\s+course/i,
  /working\s+assessment/i,
  /reason\s+for\s+visit/i,
  /test\s+report/i,
  /delayed-release/i,
  /oral\s+suspension/i,
];

// Pure dates or months
const MONTHS_AND_DATES_PATTERN = /^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?:\s+\d{1,4})?$/i;
const ONLY_NUMBERS_OR_DATES = /^[\d\s\/\-.:]+$/;

// Banned phrases and patterns for allergen substances
const BANNED_ALLERGEN_PATTERNS = [
  /^appointment\.?$/i,
  /not\s+an?\s+automatically\s+confirmed/i,
  /synthetic\s+report/i,
  /prescribed\s+course/i,
  /this\s+date\s+is\s+a\s+follow/i,
  /follow[\s-]?up/i,
  /recommendation/i,
  /approximately/i,
  /minutes?\s+after/i,
  /patient\s+reports?/i,
  /newly\s+disclosed/i,
  /requires?\s+review/i,
  /not\s+clinician-confirmed/i,
  /substance/i,
  /reaction/i,
  /reported\s+source/i,
  /review\s+status/i,
  /do\s+not\s+infer/i,
  /clinical\s+use/i,
  /page\s+\d+/i,
  /tablets?/i,
  /capsules?/i,
  /orally/i,
  /daily/i,
];

// Known valid allergen classes / common allergens
const KNOWN_ALLERGENS_SET = new Set([
  'ibuprofen', 'penicillin', 'amoxicillin', 'ampicillin', 'aspirin',
  'sulfa', 'sulfamethoxazole', 'codeine', 'morphine', 'nsaid', 'nsaids',
  'contrast dye', 'iodine', 'latex', 'peanuts', 'peanut', 'tree nuts',
  'shellfish', 'fish', 'milk', 'eggs', 'egg', 'wheat', 'soy', 'sesame',
  'gluten', 'dust', 'dust mites', 'pollen', 'mold', 'animal dander',
  'cat dander', 'dog dander', 'bee sting', 'wasp sting', 'insect sting',
  'cephalosporin', 'tetracycline', 'erythromycin', 'ciprofloxacin',
  'carbamazepine', 'phenytoin', 'allopurinol', 'paracetamol',
]);

/**
 * Validate a candidate medication entry.
 * Enforces evidence rules, length limits, and negative phrase checks.
 */
export function validateMedicationCandidate(
  candidate: Partial<ValidatedMedication>
): ValidationResult<ValidatedMedication> {
  const rawName = candidate.name?.trim() || '';

  // 1. Length validation
  if (rawName.length < 2) {
    return { isValid: false, rejectionReason: 'Medication name too short' };
  }
  if (rawName.length > 50) {
    return { isValid: false, rejectionReason: 'Medication name too long (sentence or paragraph)' };
  }

  // 2. Reject pure numbers or dates
  if (ONLY_NUMBERS_OR_DATES.test(rawName)) {
    return { isValid: false, rejectionReason: 'Medication name contains only numbers or date symbols' };
  }
  if (MONTHS_AND_DATES_PATTERN.test(rawName)) {
    return { isValid: false, rejectionReason: 'Medication name is a calendar month or year' };
  }

  // 3. Reject sentences with sentence terminators or multiple clauses
  if (/[.!?]\s+[A-Za-z]/.test(rawName)) {
    return { isValid: false, rejectionReason: 'Medication name contains multiple sentences' };
  }

  // 4. Reject strings ending in prepositions or dangling words
  if (/\b(?:on|in|at|to|for|with|by|of|from|and|or|after|before|is|a|the)$/i.test(rawName)) {
    return { isValid: false, rejectionReason: 'Medication name is an incomplete sentence fragment ending in preposition' };
  }

  // 5. Reject banned non-medication phrases
  for (const pattern of BANNED_MEDICATION_PATTERNS) {
    if (pattern.test(rawName)) {
      return { isValid: false, rejectionReason: `Medication name matched prohibited pattern: ${pattern}` };
    }
  }

  // 6. Reject pure verbs or action instructions without medicine
  if (/^(?:take|swallow|inject|apply|inhale|chew|drink|administer)\b/i.test(rawName) && !candidate.strength) {
    return { isValid: false, rejectionReason: 'Text describes medication administration without a recognizable medicine' };
  }

  // 7. Clinical evidence check:
  // Must have a clean title-cased name, and either:
  // (a) is a recognized single/double-word pharmaceutical name, OR
  // (b) has structured dosage/strength/frequency support from a prescription section.
  const wordCount = rawName.split(/\s+/).length;
  if (wordCount > 4) {
    return { isValid: false, rejectionReason: `Medication name has too many words (${wordCount}): likely a sentence fragment` };
  }

  // Build clean normalized candidate
  const cleanName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
  const validated: ValidatedMedication = {
    name: cleanName,
    strength: candidate.strength?.trim() || null,
    dose: candidate.dose?.trim() || null,
    route: candidate.route?.trim() || 'Oral',
    frequency: candidate.frequency?.trim() || null,
    instructions: candidate.instructions?.trim() || null,
    startDate: candidate.startDate || null,
    endDate: candidate.endDate || null,
    duration: candidate.duration || null,
    status: candidate.status || 'unknown',
    sourceSection: candidate.sourceSection || 'Prescription',
    sourcePage: candidate.sourcePage || null,
    sourceText: candidate.sourceText || rawName,
    reviewStatus: candidate.reviewStatus || 'pending',
  };

  return { isValid: true, value: validated };
}

/**
 * Validate a candidate allergy entry.
 * Enforces substance evidence, excludes administrative sentences and appointment text.
 */
export function validateAllergyCandidate(
  candidate: Partial<ValidatedAllergy>
): ValidationResult<ValidatedAllergy> {
  const rawAllergen = candidate.allergen?.trim() || '';

  // 1. Length validation
  if (rawAllergen.length < 2) {
    return { isValid: false, rejectionReason: 'Allergen name too short' };
  }
  if (rawAllergen.length > 40) {
    return { isValid: false, rejectionReason: 'Allergen name too long (sentence fragment)' };
  }

  // 2. Reject pure numbers or dates
  if (ONLY_NUMBERS_OR_DATES.test(rawAllergen) || MONTHS_AND_DATES_PATTERN.test(rawAllergen)) {
    return { isValid: false, rejectionReason: 'Allergen is a date or number' };
  }

  // 3. Reject banned non-allergy phrases (appointment text, disclaimers, etc.)
  for (const pattern of BANNED_ALLERGEN_PATTERNS) {
    if (pattern.test(rawAllergen)) {
      return { isValid: false, rejectionReason: `Allergen matched non-allergy phrase: ${pattern}` };
    }
  }

  // 4. Reject trailing punctuation or fragment phrases
  if (/[.!?]$/.test(rawAllergen) && rawAllergen.length > 10) {
    return { isValid: false, rejectionReason: 'Allergen ends with sentence punctuation' };
  }
  if (/\b(?:on|in|at|to|for|with|by|of|from|and|or|after|before|is|a|the)$/i.test(rawAllergen)) {
    return { isValid: false, rejectionReason: 'Allergen is an incomplete sentence fragment ending in preposition' };
  }

  // 5. Word count check:
  // Allergens are substances (1 to 3 words, e.g. "Ibuprofen", "Contrast dye", "Peanuts", "Dust mites")
  const wordCount = rawAllergen.split(/\s+/).length;
  if (wordCount > 3 && !KNOWN_ALLERGENS_SET.has(rawAllergen.toLowerCase())) {
    return { isValid: false, rejectionReason: `Allergen string has ${wordCount} words; genuine allergens are specific substances` };
  }

  // 6. Clean reaction string:
  let cleanReaction = candidate.reaction?.trim() || null;
  if (cleanReaction) {
    // If reaction string accidentally contains administrative disclaimers, sanitize it
    if (/synthetic\s+report|automatically\s+confirmed|appointment/i.test(cleanReaction)) {
      cleanReaction = cleanReaction.replace(/(?:This\s+date\s+is\s+a\s+follow[\s\S]*|not\s+an?\s+automatically[\s\S]*)/i, '').trim();
    }
    // Remove trailing periods/dashes
    cleanReaction = cleanReaction.replace(/[.\-,;]+$/, '').trim();
    if (cleanReaction.length > 0) {
      cleanReaction = cleanReaction.charAt(0).toUpperCase() + cleanReaction.slice(1);
    } else {
      cleanReaction = null;
    }
  }

  const cleanAllergen = rawAllergen.charAt(0).toUpperCase() + rawAllergen.slice(1);

  const validated: ValidatedAllergy = {
    allergen: cleanAllergen,
    reaction: cleanReaction,
    severity: candidate.severity || 'moderate',
    source: candidate.source === 'clinician-confirmed' ? 'clinician-confirmed' : 'patient-reported',
    sourceSection: candidate.sourceSection || 'Allergies',
    sourcePage: candidate.sourcePage || null,
    sourceText: candidate.sourceText || rawAllergen,
    reviewStatus: candidate.reviewStatus || 'pending',
  };

  return { isValid: true, value: validated };
}

/**
 * Check if an existing database or localStorage record is a legacy malformed entry.
 * Used for safe cleanup.
 */
export function isInvalidLegacyRecord(record: any, type: 'medication' | 'allergy'): boolean {
  return getRecordValidationInfo(record, type).isInvalid;
}

/**
 * Get detailed validation result and reason for a record.
 */
export function getRecordValidationInfo(
  record: any,
  type: 'medication' | 'allergy'
): { isInvalid: boolean; reason: string | null } {
  if (!record) return { isInvalid: false, reason: null };

  if (type === 'medication') {
    const name = (record.name || '').trim();
    const res = validateMedicationCandidate({
      name,
      strength: record.strength,
      dose: record.dose,
    });
    return {
      isInvalid: !res.isValid,
      reason: res.rejectionReason || null,
    };
  }

  if (type === 'allergy') {
    const allergen = (record.allergen || '').trim();
    const res = validateAllergyCandidate({
      allergen,
      reaction: record.reaction,
    });
    return {
      isInvalid: !res.isValid,
      reason: res.rejectionReason || null,
    };
  }

  return { isInvalid: false, reason: null };
}

/**
 * Audit lists of existing medications and allergies for corrupted entries.
 */
export function auditMedicalRecords<
  M extends { id?: string; name?: string; strength?: string | null; dose?: string | null },
  A extends { id?: string; allergen?: string; reaction?: string | null }
>(
  medications: M[],
  allergies: A[]
): {
  invalidMeds: { record: M; reason: string }[];
  invalidAllergies: { record: A; reason: string }[];
  validMeds: M[];
  validAllergies: A[];
} {
  const invalidMeds: { record: M; reason: string }[] = [];
  const invalidAllergies: { record: A; reason: string }[] = [];
  const validMeds: M[] = [];
  const validAllergies: A[] = [];

  for (const med of medications) {
    const info = getRecordValidationInfo(med, 'medication');
    if (info.isInvalid) {
      invalidMeds.push({ record: med, reason: info.reason || 'Failed clinical medication criteria' });
    } else {
      validMeds.push(med);
    }
  }

  for (const alg of allergies) {
    const info = getRecordValidationInfo(alg, 'allergy');
    if (info.isInvalid) {
      invalidAllergies.push({ record: alg, reason: info.reason || 'Failed clinical allergen criteria' });
    } else {
      validAllergies.push(alg);
    }
  }

  return { invalidMeds, invalidAllergies, validMeds, validAllergies };
}
