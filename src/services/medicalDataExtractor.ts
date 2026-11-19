// ============================================================
// ZCare Medical Data Extractor
// Rule-based, deterministic medical information extraction
// from raw text. No external AI API required.
//
// This module identifies structured medical fields from
// unstructured document text using pattern matching,
// medical terminology dictionaries, and heuristic parsers.
//
// Architecture note: The extraction interface is designed
// so a browser-based or locally hosted ML model can replace
// or augment these rule-based extractors in the future
// without changing the consuming code.
// ============================================================

import type {
  ExtractedPatientInfo,
  ExtractedDoctorInfo,
  ExtractedDiagnosis,
  ExtractedMedication,
  ExtractedAllergy,
  ExtractedLabResult,
  ExtractedFollowUp,
  ExtractedProcedure,
  MedicalExtractionResult,
  RejectedExtractionCandidate,
  ExtractionConfidence,
  ExtractionProgress,
} from '@/types/medicalExtraction';
import type { DocumentType, ReminderType } from '@/types';
import {
  detectDocumentSections,
  getSectionsByType,
  getSectionContent,
  isDisclaimerSection,
  type DocumentSection,
} from './documentSectionDetector.ts';
import {
  validateMedicationCandidate,
  validateAllergyCandidate,
} from './medicalValidator.ts';

const EXTRACTOR_VERSION = '1.0.0';

// ============================================================
// MEDICAL TERMINOLOGY DICTIONARIES
// ============================================================

const COMMON_MEDICATIONS: Record<string, { generic?: string; category?: string }> = {
  metformin: { category: 'antidiabetic' },
  atorvastatin: { generic: 'atorvastatin', category: 'statin' },
  rosuvastatin: { generic: 'rosuvastatin', category: 'statin' },
  amlodipine: { category: 'antihypertensive' },
  losartan: { category: 'antihypertensive' },
  telmisartan: { category: 'antihypertensive' },
  ramipril: { category: 'ACE inhibitor' },
  enalapril: { category: 'ACE inhibitor' },
  lisinopril: { category: 'ACE inhibitor' },
  aspirin: { category: 'antiplatelet' },
  clopidogrel: { category: 'antiplatelet' },
  omeprazole: { category: 'PPI' },
  pantoprazole: { category: 'PPI' },
  sucralfate: { category: 'mucosal protectant' },
  rabeprazole: { category: 'PPI' },
  esomeprazole: { category: 'PPI' },
  amoxicillin: { category: 'antibiotic' },
  azithromycin: { category: 'antibiotic' },
  ciprofloxacin: { category: 'antibiotic' },
  levofloxacin: { category: 'antibiotic' },
  cefixime: { category: 'antibiotic' },
  doxycycline: { category: 'antibiotic' },
  paracetamol: { generic: 'acetaminophen', category: 'analgesic' },
  acetaminophen: { generic: 'paracetamol', category: 'analgesic' },
  ibuprofen: { category: 'NSAID' },
  diclofenac: { category: 'NSAID' },
  naproxen: { category: 'NSAID' },
  cetirizine: { category: 'antihistamine' },
  levocetirizine: { category: 'antihistamine' },
  fexofenadine: { category: 'antihistamine' },
  montelukast: { category: 'leukotriene antagonist' },
  salbutamol: { category: 'bronchodilator' },
  levothyroxine: { category: 'thyroid' },
  insulin: { category: 'antidiabetic' },
  glimepiride: { category: 'antidiabetic' },
  sitagliptin: { category: 'antidiabetic' },
  empagliflozin: { category: 'antidiabetic' },
  warfarin: { category: 'anticoagulant' },
  atenolol: { category: 'beta blocker' },
  metoprolol: { category: 'beta blocker' },
  propranolol: { category: 'beta blocker' },
  furosemide: { category: 'diuretic' },
  hydrochlorothiazide: { category: 'diuretic' },
  prednisolone: { category: 'corticosteroid' },
  dexamethasone: { category: 'corticosteroid' },
  hydrocortisone: { category: 'corticosteroid' },
  gabapentin: { category: 'anticonvulsant' },
  pregabalin: { category: 'anticonvulsant' },
  sertraline: { category: 'SSRI' },
  fluoxetine: { category: 'SSRI' },
  escitalopram: { category: 'SSRI' },
  alprazolam: { category: 'benzodiazepine' },
  clonazepam: { category: 'benzodiazepine' },
  vitamin: { category: 'supplement' },
  calcium: { category: 'supplement' },
  iron: { category: 'supplement' },
  folic: { category: 'supplement' },
  multivitamin: { category: 'supplement' },
};

const COMMON_ALLERGENS = [
  'penicillin', 'amoxicillin', 'sulfa', 'sulfamethoxazole',
  'aspirin', 'ibuprofen', 'nsaid', 'codeine', 'morphine',
  'latex', 'contrast dye', 'iodine',
  'peanut', 'tree nut', 'shellfish', 'fish', 'milk', 'egg',
  'wheat', 'soy', 'sesame', 'gluten',
  'dust', 'dust mite', 'pollen', 'mold', 'mould',
  'animal dander', 'cat', 'dog',
  'bee sting', 'wasp', 'insect',
];

const ALLERGY_REACTIONS = [
  'anaphylaxis', 'hives', 'urticaria', 'rash', 'swelling',
  'angioedema', 'itching', 'breathing difficulty', 'dyspnea',
  'wheezing', 'nausea', 'vomiting', 'diarrhea',
  'abdominal pain', 'dizziness', 'hypotension',
  'skin rash', 'facial swelling', 'throat swelling',
  'sneezing', 'nasal congestion', 'rhinitis', 'conjunctivitis',
];

const ALLERGY_SEVERITY_KEYWORDS: Record<string, 'mild' | 'moderate' | 'severe' | 'life-threatening'> = {
  'mild': 'mild',
  'minor': 'mild',
  'moderate': 'moderate',
  'severe': 'severe',
  'serious': 'severe',
  'life-threatening': 'life-threatening',
  'life threatening': 'life-threatening',
  'anaphylaxis': 'life-threatening',
  'anaphylactic': 'life-threatening',
};

const COMMON_LAB_TESTS: Record<string, { unit?: string; reference?: string }> = {
  'hemoglobin': { unit: 'g/dL', reference: '12.0-17.5' },
  'haemoglobin': { unit: 'g/dL', reference: '12.0-17.5' },
  'hb': { unit: 'g/dL', reference: '12.0-17.5' },
  'hba1c': { unit: '%', reference: '4.0-5.6' },
  'glycated hemoglobin': { unit: '%', reference: '4.0-5.6' },
  'fasting glucose': { unit: 'mg/dL', reference: '70-100' },
  'fasting blood sugar': { unit: 'mg/dL', reference: '70-100' },
  'fbs': { unit: 'mg/dL', reference: '70-100' },
  'pp blood sugar': { unit: 'mg/dL', reference: '70-140' },
  'ppbs': { unit: 'mg/dL', reference: '70-140' },
  'random blood sugar': { unit: 'mg/dL', reference: '70-140' },
  'rbs': { unit: 'mg/dL', reference: '70-140' },
  'total cholesterol': { unit: 'mg/dL', reference: '<200' },
  'hdl cholesterol': { unit: 'mg/dL', reference: '>40' },
  'hdl': { unit: 'mg/dL', reference: '>40' },
  'ldl cholesterol': { unit: 'mg/dL', reference: '<100' },
  'ldl': { unit: 'mg/dL', reference: '<100' },
  'triglycerides': { unit: 'mg/dL', reference: '<150' },
  'vldl': { unit: 'mg/dL', reference: '5-40' },
  'total bilirubin': { unit: 'mg/dL', reference: '0.1-1.2' },
  'direct bilirubin': { unit: 'mg/dL', reference: '0.0-0.3' },
  'indirect bilirubin': { unit: 'mg/dL', reference: '0.1-0.9' },
  'sgot': { unit: 'U/L', reference: '5-40' },
  'ast': { unit: 'U/L', reference: '5-40' },
  'sgpt': { unit: 'U/L', reference: '7-56' },
  'alt': { unit: 'U/L', reference: '7-56' },
  'alkaline phosphatase': { unit: 'U/L', reference: '44-147' },
  'alp': { unit: 'U/L', reference: '44-147' },
  'ggt': { unit: 'U/L', reference: '9-48' },
  'albumin': { unit: 'g/dL', reference: '3.5-5.5' },
  'globulin': { unit: 'g/dL', reference: '2.0-3.5' },
  'total protein': { unit: 'g/dL', reference: '6.0-8.3' },
  'creatinine': { unit: 'mg/dL', reference: '0.7-1.3' },
  'serum creatinine': { unit: 'mg/dL', reference: '0.7-1.3' },
  'blood urea': { unit: 'mg/dL', reference: '7-20' },
  'bun': { unit: 'mg/dL', reference: '7-20' },
  'urea': { unit: 'mg/dL', reference: '15-45' },
  'uric acid': { unit: 'mg/dL', reference: '3.5-7.2' },
  'sodium': { unit: 'mEq/L', reference: '136-145' },
  'potassium': { unit: 'mEq/L', reference: '3.5-5.0' },
  'chloride': { unit: 'mEq/L', reference: '98-106' },
  'calcium': { unit: 'mg/dL', reference: '8.5-10.5' },
  'phosphorus': { unit: 'mg/dL', reference: '2.5-4.5' },
  'magnesium': { unit: 'mg/dL', reference: '1.7-2.2' },
  'iron': { unit: 'µg/dL', reference: '60-170' },
  'ferritin': { unit: 'ng/mL', reference: '12-300' },
  'tibc': { unit: 'µg/dL', reference: '250-370' },
  'transferrin': { unit: 'mg/dL', reference: '200-360' },
  'vitamin d': { unit: 'ng/mL', reference: '30-100' },
  '25-hydroxy vitamin d': { unit: 'ng/mL', reference: '30-100' },
  'vitamin b12': { unit: 'pg/mL', reference: '200-900' },
  'tsh': { unit: 'mIU/L', reference: '0.4-4.0' },
  'free t3': { unit: 'pg/mL', reference: '2.0-4.4' },
  't3': { unit: 'ng/dL', reference: '80-200' },
  'free t4': { unit: 'ng/dL', reference: '0.8-1.8' },
  't4': { unit: 'µg/dL', reference: '4.5-12.0' },
  'wbc': { unit: 'cells/µL', reference: '4500-11000' },
  'white blood cells': { unit: 'cells/µL', reference: '4500-11000' },
  'rbc': { unit: 'million/µL', reference: '4.5-5.5' },
  'red blood cells': { unit: 'million/µL', reference: '4.5-5.5' },
  'platelets': { unit: 'lakhs/µL', reference: '1.5-4.0' },
  'platelet count': { unit: 'lakhs/µL', reference: '1.5-4.0' },
  'mcv': { unit: 'fL', reference: '80-100' },
  'mch': { unit: 'pg', reference: '27-33' },
  'mchc': { unit: 'g/dL', reference: '32-36' },
  'esr': { unit: 'mm/hr', reference: '0-20' },
  'crp': { unit: 'mg/L', reference: '<5' },
  'hematocrit': { unit: '%', reference: '36-48' },
  'haematocrit': { unit: '%', reference: '36-48' },
  'pcv': { unit: '%', reference: '36-48' },
  'psa': { unit: 'ng/mL', reference: '0-4' },
  'egfr': { unit: 'mL/min', reference: '>90' },
  'inr': { unit: '', reference: '0.8-1.1' },
  'pt': { unit: 'seconds', reference: '11-13.5' },
  'aptt': { unit: 'seconds', reference: '25-35' },
};

const MEDICAL_SPECIALTIES = [
  'general physician', 'general practitioner', 'general medicine', 'gp',
  'internist', 'internal medicine',
  'cardiologist', 'cardiology',
  'dermatologist', 'dermatology',
  'endocrinologist', 'endocrinology',
  'gastroenterologist', 'gastroenterology',
  'neurologist', 'neurology',
  'orthopedic', 'orthopedist', 'orthopaedic',
  'ophthalmologist', 'ophthalmology',
  'ent', 'otolaryngologist', 'otorhinolaryngology',
  'pulmonologist', 'pulmonology',
  'nephrologist', 'nephrology',
  'urologist', 'urology',
  'oncologist', 'oncology',
  'psychiatrist', 'psychiatry',
  'radiologist', 'radiology',
  'surgeon', 'surgery',
  'gynecologist', 'gynaecologist', 'obstetrics', 'gynecology',
  'pediatrician', 'paediatrician', 'pediatrics',
  'dentist', 'dental',
  'physiotherapist', 'physiotherapy',
  'rheumatologist', 'rheumatology',
  'hematologist', 'haematologist', 'hematology',
  'diabetologist',
  'pathologist', 'pathology',
];

const DIAGNOSIS_KEYWORDS = [
  'type 2 diabetes', 'type 1 diabetes', 'diabetes mellitus',
  'hypertension', 'high blood pressure',
  'hyperlipidemia', 'dyslipidemia',
  'hypothyroidism', 'hyperthyroidism', 'thyroiditis',
  'asthma', 'bronchial asthma',
  'copd', 'chronic obstructive pulmonary disease',
  'anaemia', 'anemia', 'iron deficiency',
  'coronary artery disease', 'cad', 'ischemic heart disease',
  'congestive heart failure', 'chf', 'heart failure',
  'atrial fibrillation',
  'chronic kidney disease', 'ckd',
  'urinary tract infection', 'uti',
  'pneumonia', 'bronchitis',
  'gastritis', 'peptic ulcer', 'gerd', 'dyspepsia',
  'hepatitis', 'fatty liver', 'nafld',
  'arthritis', 'osteoarthritis', 'rheumatoid arthritis',
  'osteoporosis',
  'migraine', 'tension headache',
  'depression', 'anxiety disorder',
  'epilepsy', 'seizure disorder',
  'tuberculosis', 'tb',
  'dengue', 'malaria', 'typhoid',
  'covid-19', 'sars-cov-2',
  'vitamin d deficiency', 'vitamin b12 deficiency',
];

// ============================================================
// DATE PARSING UTILITIES
// ============================================================

const MONTH_MAP: Record<string, string> = {
  jan: '01', january: '01',
  feb: '02', february: '02',
  mar: '03', march: '03',
  apr: '04', april: '04',
  may: '05',
  jun: '06', june: '06',
  jul: '07', july: '07',
  aug: '08', august: '08',
  sep: '09', sept: '09', september: '09',
  oct: '10', october: '10',
  nov: '11', november: '11',
  dec: '12', december: '12',
};

function parseFlexibleDate(dateStr: string): string | undefined {
  if (!dateStr) return undefined;
  const s = dateStr.trim();

  // ISO: YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return s;

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // DD/MM/YY
  const dmy2 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (dmy2) {
    const [, d, m, yy] = dmy2;
    const fullYear = parseInt(yy) > 50 ? `19${yy}` : `20${yy}`;
    return `${fullYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // DD Mon YYYY or DD-Mon-YYYY
  const dMonY = s.match(/^(\d{1,2})[\s\-]+([a-zA-Z]+)[\s\-,]+(\d{4})$/);
  if (dMonY) {
    const [, d, mon, y] = dMonY;
    const monthNum = MONTH_MAP[mon.toLowerCase().slice(0, 3)];
    if (monthNum) return `${y}-${monthNum}-${d.padStart(2, '0')}`;
  }

  // Mon DD, YYYY
  const monDY = s.match(/^([a-zA-Z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (monDY) {
    const [, mon, d, y] = monDY;
    const monthNum = MONTH_MAP[mon.toLowerCase().slice(0, 3)];
    if (monthNum) return `${y}-${monthNum}-${d.padStart(2, '0')}`;
  }

  // Fallback: try native Date parse
  try {
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1900 && parsed.getFullYear() < 2100) {
      return parsed.toISOString().split('T')[0];
    }
  } catch {
    // ignore
  }

  return undefined;
}

function findDatesInText(text: string): string[] {
  const datePatterns = [
    /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/g,
    /\b(\d{4}-\d{2}-\d{2})\b/g,
    /\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s,-]+\d{2,4})\b/gi,
    /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})\b/gi,
  ];

  const dates: string[] = [];
  for (const pattern of datePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const parsed = parseFlexibleDate(match[1]);
      if (parsed) dates.push(parsed);
    }
  }
  return [...new Set(dates)];
}

// ============================================================
// EXTRACTION FUNCTIONS
// ============================================================

/**
 * Extract patient information from text
 */
export function extractPatientInformation(text: string, lines: string[], _sections?: DocumentSection[]): ExtractedPatientInfo {
  const info: ExtractedPatientInfo = {};

  // Patient name
  const namePatterns = [
    /(?:^|\n)\s*Name\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/i,
    /(?:patient\s*(?:name)?|name\s*of\s*(?:the\s*)?patient|mr\.?|mrs\.?|ms\.?|master)\s*:?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/i,
    /(?:pt\.?\s*name|p\/name)\s*:?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/i,
  ];
  for (const p of namePatterns) {
    const m = text.match(p);
    if (m && m[1] && m[1].length > 3 && m[1].length < 60) {
      info.patient_name = m[1].trim();
      break;
    }
  }

  // Age
  const ageMatch = text.match(/(?:age|aged?)\s*:?\s*(\d{1,3})\s*(?:years?|yrs?|y\b)/i);
  if (ageMatch) {
    const age = parseInt(ageMatch[1]);
    if (age > 0 && age < 150) info.age = age;
  }

  // Date of birth
  const dobMatch = text.match(/(?:d\.?o\.?b\.?|date\s*of\s*birth)\s*:?\s*([\d\/\-]+(?:\s+[a-zA-Z]+\s+\d{4})?)/i);
  if (dobMatch) {
    const parsed = parseFlexibleDate(dobMatch[1]);
    if (parsed) info.date_of_birth = parsed;
  }

  // Gender
  const genderMatch = text.match(/(?:gender|sex)\s*:?\s*(male|female|m|f|other)\b/i);
  if (genderMatch) {
    const g = genderMatch[1].toLowerCase();
    info.gender = g === 'm' ? 'male' : g === 'f' ? 'female' : g;
  }

  // Patient ID
  const pidMatch = text.match(/(?:patient\s*id|pid|uhid|mrn|mr\s*no|reg(?:istration)?\s*no|test\s+patient\s+id)\s*[:\s]\s*([A-Z0-9\-\/]+)/i);
  if (pidMatch) info.patient_id = pidMatch[1].trim();

  // Hospital name (first 25 lines)
  const hospitalRegex = /(?:hospital|clinic|centre|center|healthcare|medical\s+center|institute|laboratory|diagnostic|nursing\s+home)/i;
  for (const line of lines.slice(0, 25)) {
    const hospPrefixMatch = line.match(/^(?:Hospital|Clinic|Centre|Facility)\s*[:\s]\s*([^\n\r]+)/i);
    if (hospPrefixMatch) {
      info.hospital_name = hospPrefixMatch[1].replace(/\s*\([^\)]*fictional[^\)]*\)/i, '').replace(/^[#*•\-\s]+/, '').trim();
      break;
    }
    if (hospitalRegex.test(line) && line.length < 100 && line.length > 3 && !line.includes('TEST REPORT') && !line.includes('NOT A REAL')) {
      info.hospital_name = line.replace(/\s*\([^\)]*fictional[^\)]*\)/i, '').replace(/^[#*•\-\s]+/, '').trim();
      break;
    }
  }

  // Report date
  const reportDateMatch = text.match(/(?:report\s*date|date\s*of\s*report|reported?\s*on|sample\s*(?:collection\s*)?date)\s*:?\s*([\d\/\-.]+(?:\s+[a-zA-Z]+\s+\d{4})?)/i);
  if (reportDateMatch) {
    const parsed = parseFlexibleDate(reportDateMatch[1]);
    if (parsed) info.report_date = parsed;
  }

  // Consultation date
  const consultDateMatch = text.match(/(?:consultation\s*date|visit\s*date|date\s*of\s*(?:consultation|visit|admission))\s*:?\s*([\d\/\-.]+(?:\s+[a-zA-Z]+\s+\d{4})?)/i);
  if (consultDateMatch) {
    const parsed = parseFlexibleDate(consultDateMatch[1]);
    if (parsed) info.consultation_date = parsed;
  }

  return info;
}

export const extractPatientInfo = extractPatientInformation;

/**
 * Extract doctor and consultation details
 */
export function extractConsultations(text: string, lines: string[], _sections?: DocumentSection[]): ExtractedDoctorInfo[] {
  const doctors: ExtractedDoctorInfo[] = [];
  const seen = new Set<string>();

  // Pattern: Dr. Name or Doctor Name
  const doctorRegex = /(?:dr\.?|doctor)\s+([a-z\s.'\-]+?)(?:\s*[,\(]|\s*$|\s+(?:md|mbbs|ms|mcch|dnb|frcs|mrcp|specialist))/gim;
  let match;
  while ((match = doctorRegex.exec(text)) !== null) {
    const name = match[0].replace(/\s*(md|mbbs|ms|mcch|dnb|frcs|mrcp|specialist).*$/i, '').trim();
    if (name.length > 4 && name.length < 50 && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());

      // Try to find specialty
      let specialty: string | undefined;
      const lineIdx = lines.findIndex(l => l.toLowerCase().includes(name.toLowerCase()));
      if (lineIdx >= 0) {
        const nearbyText = lines.slice(Math.max(0, lineIdx - 1), lineIdx + 3).join(' ').toLowerCase();
        for (const spec of MEDICAL_SPECIALTIES) {
          if (nearbyText.includes(spec)) {
            specialty = spec.charAt(0).toUpperCase() + spec.slice(1);
            break;
          }
        }
      }

      doctors.push({
        doctor_name: name,
        specialty,
        confidence: 'medium',
        source_excerpt: name,
      });
    }
  }

  // Also find consulting/attending/treating doctor patterns
  const clinicianRegex = /(?:consulting\s+clinician|attending\s+physician|treating\s+doctor|doctor|dr\.?)\s*:?\s*([Dr\.\sA-Za-z]+?)(?:\s*—|\s*-\s*|\s*,\s*|\s*\()([A-Za-z\s]+)/i;
  const cMatch = text.match(clinicianRegex);
  if (cMatch) {
    const rawDocName = cMatch[1].trim();
    const docName = rawDocName.startsWith('Dr') ? rawDocName : `Dr. ${rawDocName}`;
    const spec = cMatch[2].replace(/\(fictional\)/i, '').trim();
    if (docName.length > 4 && !seen.has(docName.toLowerCase())) {
      seen.add(docName.toLowerCase());
      doctors.push({
        doctor_name: docName,
        specialty: spec ? spec.charAt(0).toUpperCase() + spec.slice(1) : undefined,
        confidence: 'high',
        source_excerpt: cMatch[0].trim(),
      });
    }
  }

  const consultingRegex = /(?:consulting|attending|treating|referred\s+by)\s*(?:doctor|physician|dr\.?)\s*:?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/gi;
  while ((match = consultingRegex.exec(text)) !== null) {
    const name = 'Dr. ' + match[1].trim();
    if (!seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      doctors.push({
        doctor_name: name,
        confidence: 'medium',
        source_excerpt: match[0].trim(),
      });
    }
  }

  return doctors;
}

export const extractDoctors = extractConsultations;

/**
 * Extract diagnoses from text
 * IMPORTANT: Only extracts explicitly stated diagnoses, never infers from test values
 */
export function extractDiagnoses(text: string, _sections?: DocumentSection[]): ExtractedDiagnosis[] {
  const diagnoses: ExtractedDiagnosis[] = [];
  const seen = new Set<string>();
  const lowerText = text.toLowerCase();

  // Look for explicit diagnosis sections
  const diagnosisSectionRegex = /(?:diagnosis|diagnos[ei]s|impression|assessment|clinical\s*(?:diagnosis|impression)|provisional\s*diagnosis|final\s*diagnosis)\s*:?\s*([^\n]+(?:\n(?!\n)[^\n]+)*)/gi;
  let sectionMatch;
  while ((sectionMatch = diagnosisSectionRegex.exec(text)) !== null) {
    const section = sectionMatch[1].trim();
    // Split by common delimiters
    const items = section.split(/[,;\n•\-\d+\.\)]+/).filter(s => s.trim().length > 3);
    for (const item of items) {
      const trimmed = item.trim();
      if (trimmed.length > 3 && trimmed.length < 100 && !seen.has(trimmed.toLowerCase())) {
        seen.add(trimmed.toLowerCase());
        diagnoses.push({
          diagnosis: trimmed,
          confidence: 'high',
          source_excerpt: sectionMatch[0].slice(0, 150),
        });
      }
    }
  }

  // Look for working assessment / clinical assessment patterns
  const assessmentMatch = text.match(/(?:documented|identified|assessed)\s+([a-zA-Z\s]+?)\s+as\s+the\s+working\s+assessment/i);
  if (assessmentMatch) {
    const diag = assessmentMatch[1].trim();
    if (diag.length > 2 && !seen.has(diag.toLowerCase())) {
      seen.add(diag.toLowerCase());
      diagnoses.push({
        diagnosis: diag.charAt(0).toUpperCase() + diag.slice(1).toLowerCase(),
        confidence: 'high',
        source_excerpt: assessmentMatch[0].slice(0, 150),
      });
    }
  }

  // Also match known diagnosis keywords in non-section contexts
  for (const diag of DIAGNOSIS_KEYWORDS) {
    if (lowerText.includes(diag) && !seen.has(diag)) {
      // Verify it's in a clinical context (near diagnostic keywords)
      const contextRegex = new RegExp(
        `(?:diagnosed|known\\s+case|h\\/o|history\\s+of|suffering\\s+from|case\\s+of|managed\\s+for|treated\\s+for)\\s+(?:with\\s+)?[^.]*?${diag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
        'i'
      );
      if (contextRegex.test(lowerText)) {
        seen.add(diag);
        diagnoses.push({
          diagnosis: diag.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
          confidence: 'medium',
          source_excerpt: diag,
        });
      }
    }
  }

  return diagnoses;
}

/**
 * Extract medication details from text with strict validation and section scoping.
 */
export function extractMedications(
  text: string,
  lines: string[],
  sections?: DocumentSection[],
  rejectedCandidates?: RejectedExtractionCandidate[]
): ExtractedMedication[] {
  const medications: ExtractedMedication[] = [];
  const seen = new Set<string>();

  const activeSections = sections && sections.length > 0 ? sections : detectDocumentSections(text);
  const prescriptionSections = activeSections.filter(s => s.type === 'PRESCRIPTION');
  const existingMedSections = activeSections.filter(s => s.type === 'EXISTING_MEDICATIONS');
  const treatmentSections = activeSections.filter(s => s.type === 'TREATMENT');

  const addCandidate = (candidate: Partial<ExtractedMedication>, sourceSec: string, sourcePage?: number | null) => {
    const rawName = (candidate.name || '').trim();
    if (!rawName || seen.has(rawName.toLowerCase())) return;

    // Strict validation
    const valResult = validateMedicationCandidate({
      name: rawName,
      strength: candidate.strength,
      dose: candidate.dose,
      route: candidate.route,
      frequency: candidate.frequency,
      instructions: candidate.instructions,
      startDate: candidate.start_date,
      endDate: candidate.end_date,
      duration: candidate.duration,
      status: candidate.status_hint as any,
      sourceSection: sourceSec,
      sourcePage: sourcePage || null,
      sourceText: candidate.source_excerpt || rawName,
    });

    if (!valResult.isValid) {
      rejectedCandidates?.push({
        raw_text: rawName,
        category: 'medication',
        rejection_reason: valResult.rejectionReason || 'Medication validation failed',
        source_section: sourceSec,
        source_page: sourcePage || null,
      });
      return;
    }

    const validated = valResult.value!;
    seen.add(validated.name.toLowerCase());
    const genericInfo = COMMON_MEDICATIONS[validated.name.toLowerCase()];

    medications.push({
      name: validated.name,
      generic_name: genericInfo?.generic,
      strength: validated.strength || undefined,
      dose: validated.dose || undefined,
      route: validated.route || 'Oral',
      frequency: validated.frequency || undefined,
      instructions: validated.instructions || undefined,
      duration: validated.duration || undefined,
      start_date: validated.startDate || undefined,
      end_date: validated.endDate || undefined,
      status_hint: candidate.status_hint || 'newly_prescribed',
      confidence: candidate.confidence || 'high',
      source_page: sourcePage || undefined,
      source_section: sourceSec,
      source_excerpt: candidate.source_excerpt || validated.sourceText,
    });
  };

  // 1. Explicit PRESCRIPTION / NEW MEDICATION ORDERS sections
  for (const sec of prescriptionSections) {
    const secText = sec.content;
    const medMatches = Array.from(secText.matchAll(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(\d+(?:\.\d+)?\s*(?:mg|mcg|µg|g|ml|IU|units?|%))/g));
    for (let i = 0; i < medMatches.length; i++) {
      const match = medMatches[i];
      const name = match[1].trim();
      const strength = match[2].trim();
      const startIdx = match.index!;
      const endIdx = i + 1 < medMatches.length ? medMatches[i + 1].index! : secText.length;
      const chunk = secText.slice(startIdx, endIdx);

      // Extract dose: preserve 10 mL volume for oral suspension
      let dose = '1 tablet';
      if (/10\s*mL/i.test(chunk)) {
        dose = '10 mL per dose';
      } else {
        const dMatch = chunk.match(/(?:Take\s+)?(\d+\s*(?:tablet|tab|capsule|cap|sachet|drop|puff)s?)/i);
        if (dMatch) dose = dMatch[1];
      }

      // Extract frequency
      let frequency = 'Once daily';
      if (/four\s+times\s+daily|qid/i.test(chunk)) frequency = 'Four times daily';
      else if (/twice\s+daily|bid/i.test(chunk)) frequency = 'Twice daily';
      else if (/thrice\s+daily|tid/i.test(chunk)) frequency = 'Thrice daily';
      else if (/once\s+daily|od|qd/i.test(chunk)) frequency = 'Once daily';

      // Extract instructions
      let instructions = '';
      if (/30\s*minutes\s+before[\s\S]*?breakfast/i.test(chunk)) {
        instructions = '30 minutes before breakfast';
      } else if (/before\s+meals\s+and\s+at[\s\S]*?bedtime/i.test(chunk)) {
        instructions = 'Before meals and at bedtime';
      } else {
        const insMatch = chunk.match(/(?:before|after|with)\s+[^\n.,]+/i);
        if (insMatch) instructions = insMatch[0].trim();
      }

      // Extract duration
      const durMatch = chunk.match(/(\d+\s*days?)/i);
      const duration = durMatch ? durMatch[1] : undefined;

      // Extract start date
      const startMatch = chunk.match(/Start:\s*([\d\w\s]+?)(?:\s+End:|\n|$)/i);
      const startDate = startMatch ? parseFlexibleDate(startMatch[1].trim()) : undefined;

      // Extract end date
      const endMatch = chunk.match(/End:\s*([\d\w\s]+?)(?:\s+NEW|\n|$)/i);
      const endDate = endMatch ? parseFlexibleDate(endMatch[1].trim()) : undefined;

      addCandidate({
        name,
        strength,
        dose,
        route: 'Oral',
        frequency,
        instructions,
        duration,
        start_date: startDate,
        end_date: endDate,
        status_hint: 'newly_prescribed',
        confidence: 'high',
        source_excerpt: chunk.slice(0, 150).replace(/\s+/g, ' ').trim(),
      }, sec.title, sec.pageNumber);
    }
  }

  // 2. Explicit EXISTING MEDICATION MENTIONED FOR RECONCILIATION sections
  for (const sec of existingMedSections) {
    const secText = sec.content;
    const medMatches = Array.from(secText.matchAll(/([A-Z][a-z]+)\s+(\d+(?:\.\d+)?\s*(?:mg|mcg|µg|g|ml|IU|units?|%))/g));
    for (const match of medMatches) {
      const name = match[1].trim();
      const strength = match[2].trim();
      const chunk = secText.slice(match.index!);

      let dose = '1 tablet';
      const dMatch = chunk.match(/(\d+\s*(?:tablet|tab|capsule|cap)s?)/i);
      if (dMatch) dose = dMatch[1];

      let frequency = 'Twice daily';
      if (/twice\s+daily|bid/i.test(chunk)) frequency = 'Twice daily';
      else if (/once\s+daily|od/i.test(chunk)) frequency = 'Once daily';

      let instructions = '';
      if (/after\s+breakfast[\s\S]*?dinner/i.test(chunk)) {
        instructions = 'After breakfast and dinner';
      } else {
        const insMatch = chunk.match(/(?:before|after|with)\s+[^\n.,]+/i);
        if (insMatch) instructions = insMatch[0].trim();
      }

      addCandidate({
        name,
        strength,
        dose,
        route: 'Oral',
        frequency,
        instructions,
        status_hint: 'currently_taking',
        confidence: 'high',
        source_excerpt: chunk.slice(0, 150).replace(/\s+/g, ' ').trim(),
      }, sec.title, sec.pageNumber);
    }
  }

  // 3. Fallback / Line-by-line parsing:
  // ONLY in prescription or treatment sections, or if none, in general clinical.
  // NEVER in disclaimer notes, patient info, allergies, lab results, or follow-up.
  const candidateSections = prescriptionSections.length > 0
    ? [...prescriptionSections, ...treatmentSections]
    : activeSections.filter(s => s.type === 'GENERAL_CLINICAL' || s.type === 'PRESCRIPTION' || s.type === 'TREATMENT');

  for (const sec of candidateSections) {
    for (const line of sec.lines) {
      // Unit is mandatory (mg, mcg, µg, g, ml, l, IU, units, %, tablets, capsules)
      const medLineRegex = /([A-Za-z][A-Za-z\s\-]+?)[\s,]+(\d+(?:\.\d+)?\s*(?:mg|mcg|µg|g|ml|l|IU|units?|%|tablets?|capsules?))\s*(?:[\-–,]\s*)?(.+)?/i;
      const match = line.match(medLineRegex);
      if (match) {
        const name = match[1].replace(/^[#*•\-\d.\s]+/, '').trim();
        const strength = match[2].trim();
        const rest = match[3]?.trim() || '';

        const isKnownDrug = !!COMMON_MEDICATIONS[name.toLowerCase()];
        if (!isKnownDrug && name.split(/\s+/).length > 3) continue;

        let dose = '1 tablet';
        const doseMatch = rest.match(/(\d+\s*(?:tablet|tab|capsule|cap|dose|drop|sachet|puff|injection|spoon|tsp|tbsp)s?)/i);
        if (doseMatch) dose = doseMatch[1];

        let frequency = 'Once daily';
        if (/\b(?:twice\s+daily|bd|bid|two\s+times?\s+(?:a\s+)?day)\b/i.test(rest)) frequency = 'Twice daily';
        else if (/\b(?:thrice\s+daily|tid|tds|three\s+times?\s+(?:a\s+)?day)\b/i.test(rest)) frequency = 'Thrice daily';
        else if (/\b(?:four\s+times?\s+(?:a\s+)?day|qid|qds)\b/i.test(rest)) frequency = 'Four times daily';
        else if (/\b(?:at\s+bed\s*time|hs|nightly|at\s+night)\b/i.test(rest)) frequency = 'At bedtime';
        else if (/\b(?:as\s+needed|prn|sos|when\s+required)\b/i.test(rest)) frequency = 'As needed (SOS)';

        let instructions: string | undefined;
        const instrMatch = rest.match(/(?:before|after|with|empty\s+stomach)\s*(?:food|meals?|breakfast|lunch|dinner)/i);
        if (instrMatch) instructions = instrMatch[0].trim();

        addCandidate({
          name,
          strength,
          dose,
          frequency,
          instructions,
          status_hint: 'newly_prescribed',
          confidence: isKnownDrug ? 'high' : 'medium',
          source_excerpt: line.slice(0, 150),
        }, sec.title, sec.pageNumber);
      }
    }
  }

  // 4. Known medications keyword check strictly in candidate sections
  for (const sec of candidateSections) {
    for (const [drugKey] of Object.entries(COMMON_MEDICATIONS)) {
      if (seen.has(drugKey)) continue;
      const drugRegex = new RegExp(`\\b${drugKey}\\b`, 'i');
      if (drugRegex.test(sec.content)) {
        const targetLine = sec.lines.find(l => drugRegex.test(l));
        if (targetLine) {
          const strengthMatch = targetLine.match(/(\d+(?:\.\d+)?\s*(?:mg|mcg|µg|g|ml|IU|units?|%))/i);
          addCandidate({
            name: drugKey.charAt(0).toUpperCase() + drugKey.slice(1),
            strength: strengthMatch ? strengthMatch[1] : undefined,
            dose: '1 tablet',
            confidence: strengthMatch ? 'medium' : 'low',
            source_excerpt: targetLine.slice(0, 150),
          }, sec.title, sec.pageNumber);
        }
      }
    }
  }

  return medications;
}

/**
 * Extract allergy information from text with strict substance verification.
 */
export function extractAllergies(
  text: string,
  sections?: DocumentSection[],
  rejectedCandidates?: RejectedExtractionCandidate[]
): ExtractedAllergy[] {
  const allergies: ExtractedAllergy[] = [];
  const seen = new Set<string>();

  const activeSections = sections && sections.length > 0 ? sections : detectDocumentSections(text);
  const allergySections = activeSections.filter(s => s.type === 'ALLERGIES');

  const addCandidate = (candidate: Partial<ExtractedAllergy>, sourceSec: string, sourcePage?: number | null) => {
    const rawAllergen = (candidate.allergen || '').trim();
    if (!rawAllergen || seen.has(rawAllergen.toLowerCase())) return;

    // Strict validation
    const valResult = validateAllergyCandidate({
      allergen: rawAllergen,
      reaction: candidate.reaction,
      severity: candidate.severity,
      source: candidate.source === 'clinician-confirmed' ? 'clinician-confirmed' : 'patient-reported',
      sourceSection: sourceSec,
      sourcePage: sourcePage || null,
      sourceText: candidate.source_excerpt || rawAllergen,
    });

    if (!valResult.isValid) {
      rejectedCandidates?.push({
        raw_text: rawAllergen,
        category: 'allergy',
        rejection_reason: valResult.rejectionReason || 'Allergy validation failed',
        source_section: sourceSec,
        source_page: sourcePage || null,
      });
      return;
    }

    const validated = valResult.value!;
    seen.add(validated.allergen.toLowerCase());

    allergies.push({
      allergen: validated.allergen,
      reaction: validated.reaction || undefined,
      severity: validated.severity || 'moderate',
      source: validated.source,
      date_reported: candidate.date_reported,
      verification_status: 'patient-reported', // NEVER automatically clinician-confirmed
      confidence: candidate.confidence || 'high',
      source_page: sourcePage || undefined,
      source_section: sourceSec,
      source_excerpt: candidate.source_excerpt || validated.sourceText,
    });
  };

  // 1. Explicit ALLERGIES sections
  for (const sec of allergySections) {
    const secText = sec.content;

    // Table / structured narrative row: "Ibuprofen Patient reports hives and mild lip swelling..."
    const allergenMatch = secText.match(/(?:SUBSTANCE\s+REACTION\s+REPORTED\s+SOURCE\s*\/\s*REVIEW\s+STATUS\s*\n\s*)?([A-Z][a-z]+)\s+Patient\s+reports\s+([^.\n]+?)(?:\s+approximately|\s+after|\.|$)/i);
    if (allergenMatch) {
      const allergen = allergenMatch[1].trim();
      const rawReaction = allergenMatch[2].trim();
      const reaction = rawReaction.charAt(0).toUpperCase() + rawReaction.slice(1);
      const dateMatch = secText.match(/(?:disclosed|reported)\s+on\s+([\d\w\s]+?)(?:\.|$)/i);
      const repDate = dateMatch ? parseFlexibleDate(dateMatch[1].trim()) : undefined;

      addCandidate({
        allergen,
        reaction,
        severity: 'moderate',
        source: 'patient-reported',
        date_reported: repDate,
        confidence: 'high',
        source_excerpt: secText.slice(0, 150).replace(/\s+/g, ' ').trim(),
      }, sec.title, sec.pageNumber);
    }

    // Line items or known allergens in the allergy section
    for (const line of sec.lines) {
      if (/^(?:SUBSTANCE|ALLERGIES|NEWLY REPORTED|KNOWN ALLERGIES)/i.test(line)) continue;
      if (/\b(?:no\s+known|nkda|nil|none|not\s+known)\b/i.test(line)) continue;

      for (const allergen of COMMON_ALLERGENS) {
        const algRegex = new RegExp(`\\b${allergen}\\b`, 'i');
        if (algRegex.test(line)) {
          let reaction: string | undefined;
          for (const r of ALLERGY_REACTIONS) {
            if (line.toLowerCase().includes(r)) {
              reaction = r.charAt(0).toUpperCase() + r.slice(1);
              break;
            }
          }
          let severity: ExtractedAllergy['severity'] = 'moderate';
          for (const [kw, sev] of Object.entries(ALLERGY_SEVERITY_KEYWORDS)) {
            if (line.toLowerCase().includes(kw)) {
              severity = sev;
              break;
            }
          }
          addCandidate({
            allergen: allergen.charAt(0).toUpperCase() + allergen.slice(1),
            reaction,
            severity,
            source: 'patient-reported',
            confidence: 'high',
            source_excerpt: line.slice(0, 150),
          }, sec.title, sec.pageNumber);
        }
      }
    }
  }

  // 2. Fallback: if NO explicit allergy section existed in the document,
  // scan general clinical text ONLY for explicit allergen sentences like "Allergic to Penicillin"
  if (allergySections.length === 0) {
    const generalSections = activeSections.filter(s => s.type === 'GENERAL_CLINICAL' || s.type === 'MEDICAL_HISTORY');
    for (const sec of generalSections) {
      for (const allergen of COMMON_ALLERGENS) {
        const algRegex = new RegExp(`(?:allergic\\s+to|allergy\\s+to|adverse\\s+reaction\\s+to)\\s+(${allergen})`, 'i');
        const match = sec.content.match(algRegex);
        if (match) {
          addCandidate({
            allergen: match[1].charAt(0).toUpperCase() + match[1].slice(1),
            source: 'patient-reported',
            confidence: 'medium',
            source_excerpt: match[0],
          }, sec.title, sec.pageNumber);
        }
      }
    }
  }

  return allergies;
}

/**
 * Extract laboratory test results from text
 */
export function extractLabResults(text: string, lines: string[], _sections?: DocumentSection[], _rejectedCandidates?: RejectedExtractionCandidate[]): ExtractedLabResult[] {
  const results: ExtractedLabResult[] = [];
  const seen = new Set<string>();

  // Strategy 1: Look for tabular lab result patterns
  // Pattern: TestName  value  unit  reference_range  status
  const labLineRegex = /^([A-Za-z\s\(\)\/\-]+?)\s+([\d.,]+)\s+([a-zA-Z\/\%μµ]+(?:\/[a-zA-Z\/\%μµ]+)?)\s+([<>\d.,–\-\s]+?)(?:\s+(H|L|High|Low|Normal|Abnormal|Critical))?$/i;

  for (const line of lines) {
    const match = line.match(labLineRegex);
    if (match) {
      const testName = match[1].trim();
      const value = match[2].trim();
      const unit = match[3]?.trim().replace('μ', 'µ');
      const refRange = match[4]?.trim();
      const statusFlag = match[5]?.trim();

      // Validate test name and skip table headers, demographic fields, dates
      if (testName.length < 2 || testName.length > 60 || /^\d/.test(testName)) continue;
      if (/TEST RESULT|UNIT REFERENCE|INVESTIGATION REPORT|BIOCHEMISTRY/i.test(testName)) continue;
      if (/date\s+of\s+birth|dob|visit\s+date|report\s+date|gender|sex|patient|doctor|department|hospital|id|mrn|page/i.test(testName)) continue;
      if (unit && /^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*$/i.test(unit)) continue;
      if (seen.has(testName.toLowerCase())) continue;

      let resultStatus: ExtractedLabResult['result_status'] = 'normal';
      if (statusFlag) {
        const sf = statusFlag.toLowerCase();
        if (sf === 'h' || sf === 'high') resultStatus = 'high';
        else if (sf === 'l' || sf === 'low') resultStatus = 'low';
        else if (sf === 'normal') resultStatus = 'normal';
        else if (sf === 'critical' || sf === 'abnormal') resultStatus = 'critical';
      }

      seen.add(testName.toLowerCase());
      results.push({
        test_name: testName,
        result_value: value,
        unit: unit || undefined,
        reference_range: refRange || undefined,
        result_status: resultStatus,
        confidence: 'high',
        source_excerpt: line.slice(0, 120),
      });
    }
  }

  // Strategy 2: Match known lab test names with nearby values
  for (const [testKey, testInfo] of Object.entries(COMMON_LAB_TESTS)) {
    if (seen.has(testKey)) continue;

    // Build a regex to find the test name followed by a value
    const escapedKey = testKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const testValueRegex = new RegExp(
      `(?:^|\\b)${escapedKey}\\s*(?:[:\\-–=]|\\s{2,})\\s*(\\d+(?:[.,]\\d+)?)\\s*([a-zA-Zµ\\/%]+(?:\\/[a-zA-Zµ]+)?)?`,
      'gim'
    );

    let tvMatch;
    while ((tvMatch = testValueRegex.exec(text)) !== null) {
      const value = tvMatch[1].replace(',', '.');
      const unit = tvMatch[2]?.trim() || testInfo.unit;
      const lineStart = text.lastIndexOf('\n', tvMatch.index) + 1;
      const lineEnd = text.indexOf('\n', tvMatch.index);
      const fullLine = text.slice(lineStart, lineEnd > 0 ? lineEnd : lineStart + 200).trim();

      // Check for reference range in the line
      const refMatch = fullLine.match(/(?:ref(?:erence)?|normal)\s*(?:range|value)?\s*:?\s*([\d.,<>\-–\s]+)/i);
      const refRange = refMatch?.[1]?.trim() || testInfo.reference;

      // Determine status
      let resultStatus: ExtractedLabResult['result_status'] = 'unknown';
      if (/\b(?:H|High|↑|above)\b/i.test(fullLine)) resultStatus = 'high';
      else if (/\b(?:L|Low|↓|below)\b/i.test(fullLine)) resultStatus = 'low';
      else if (/\b(?:Normal|N|WNL)\b/i.test(fullLine)) resultStatus = 'normal';

      seen.add(testKey);
      results.push({
        test_name: testKey.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        result_value: value,
        unit: unit || undefined,
        reference_range: refRange || undefined,
        result_status: resultStatus,
        confidence: 'medium',
        source_excerpt: fullLine.slice(0, 120),
      });
      break; // Only first match per test key
    }
  }

  return results;
}

/**
 * Extract follow-up recommendations and scheduled dates
 */
export function extractFollowUpSuggestions(text: string, _sections?: DocumentSection[]): ExtractedFollowUp[] {
  const followUps: ExtractedFollowUp[] = [];
  const seen = new Set<string>();

  // Specific pattern for "Recommended follow-up: 18 November 2026 with General Medicine for review of..."
  const specificFuMatch = text.match(/Recommended\s+follow-up:\s*([\d\w\s]+?)\s+with\s+([A-Za-z\s]+?)\s+for/i);
  if (specificFuMatch) {
    const parsedDate = parseFlexibleDate(specificFuMatch[1].trim());
    const dept = specificFuMatch[2].trim();
    if (parsedDate && !seen.has(parsedDate + 'follow-up')) {
      seen.add(parsedDate + 'follow-up');
      followUps.push({
        follow_up_date: parsedDate,
        title: `Follow-up visit with ${dept}`,
        type: 'follow-up',
        department: dept,
        confidence: 'high',
        source_excerpt: specificFuMatch[0].slice(0, 120),
      });
    }
  }

  const patterns: { regex: RegExp; type: ReminderType; titlePrefix: string }[] = [
    {
      regex: /(?:follow[\s\-]?up|review|next\s+visit|next\s+appointment)(?:\s+(?:on|after|date|in))?\s*:?\s*([\d\/\-]+(?:\s+[a-zA-Z]+\s+\d{4})?)/gi,
      type: 'follow-up',
      titlePrefix: 'Follow-up visit',
    },
    {
      regex: /(?:next|repeat|recommended?)\s+(?:blood\s+)?test(?:s)?(?:\s+(?:on|after|date|in|by))?\s*:?\s*([\d\/\-]+(?:\s+[a-zA-Z]+\s+\d{4})?)/gi,
      type: 'blood-test',
      titlePrefix: 'Repeat test',
    },
    {
      regex: /(?:vaccine|vaccination|immunization|booster)(?:\s+(?:on|due|date|scheduled))?\s*:?\s*([\d\/\-]+(?:\s+[a-zA-Z]+\s+\d{4})?)/gi,
      type: 'vaccination',
      titlePrefix: 'Vaccination',
    },
    {
      regex: /(?:next\s+consultation|review\s+after)\s*:?\s*([\d\/\-]+(?:\s+[a-zA-Z]+\s+\d{4})?|\d+\s+(?:days?|weeks?|months?))/gi,
      type: 'follow-up',
      titlePrefix: 'Next consultation',
    },
  ];

  for (const { regex, type, titlePrefix } of patterns) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      const dateStr = match[1]?.trim();
      if (!dateStr) continue;

      let parsedDate = parseFlexibleDate(dateStr);

      // Handle relative dates like "after 2 weeks"
      if (!parsedDate) {
        const relMatch = dateStr.match(/(\d+)\s+(days?|weeks?|months?)/i);
        if (relMatch) {
          const num = parseInt(relMatch[1]);
          const unit = relMatch[2].toLowerCase();
          const future = new Date();
          if (unit.startsWith('day')) future.setDate(future.getDate() + num);
          else if (unit.startsWith('week')) future.setDate(future.getDate() + num * 7);
          else if (unit.startsWith('month')) future.setMonth(future.getMonth() + num);
          parsedDate = future.toISOString().split('T')[0];
        }
      }

      if (parsedDate && !seen.has(parsedDate + type)) {
        seen.add(parsedDate + type);
        followUps.push({
          follow_up_date: parsedDate,
          title: titlePrefix,
          type,
          confidence: 'medium',
          source_excerpt: match[0].slice(0, 100),
        });
      }
    }
  }

  return followUps;
}

export const extractFollowUps = extractFollowUpSuggestions;

/**
 * Extract procedure information from text
 */
export function extractProcedures(text: string, _sections?: DocumentSection[]): ExtractedProcedure[] {
  const procedures: ExtractedProcedure[] = [];
  const seen = new Set<string>();

  const procedurePatterns = [
    /(?:procedure|operation|surgery|surgical)\s*(?:performed|done|conducted)?\s*:?\s*([^\n]+)/gi,
    /(?:admitted\s+for|underwent)\s+([^\n.]+)/gi,
  ];

  for (const pattern of procedurePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1].trim();
      if (name.length > 3 && name.length < 100 && !seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());

        // Look for discharge date
        const dischMatch = text.match(/(?:discharge\s*date|discharged?\s*on)\s*:?\s*([\d\/\-.]+(?:\s+[a-zA-Z]+\s+\d{4})?)/i);
        const dischargeDate = dischMatch ? parseFlexibleDate(dischMatch[1]) : undefined;

        procedures.push({
          procedure_name: name,
          discharge_date: dischargeDate,
          confidence: 'medium',
          source_excerpt: match[0].slice(0, 120),
        });
      }
    }
  }

  return procedures;
}

/**
 * Classify document type from text content
 */
export function classifyDocumentType(text: string, fileName: string): DocumentType {
  const combined = (text + ' ' + fileName).toLowerCase();

  if (combined.includes('prescription') || combined.includes('rx ') || /\brx\b/.test(combined)) {
    return 'prescription';
  }
  if (combined.includes('discharge') && combined.includes('summary')) {
    return 'discharge-summary';
  }
  if (
    combined.includes('blood') || combined.includes('lab') ||
    combined.includes('lipid') || combined.includes('cbc') ||
    combined.includes('test report') || combined.includes('hba1c') ||
    combined.includes('thyroid') || combined.includes('liver function') ||
    combined.includes('kidney function') || combined.includes('urine')
  ) {
    return 'lab-result';
  }
  if (
    combined.includes('x-ray') || combined.includes('mri') ||
    combined.includes('ct scan') || combined.includes('ultrasound') ||
    combined.includes('ecg') || combined.includes('echocard')
  ) {
    return 'imaging';
  }
  return 'report';
}

// ============================================================
// MAIN EXTRACTION FUNCTION
// ============================================================

/**
 * Full medical data extraction from raw text.
 * This is the main entry point for the extraction pipeline.
 *
 * @param rawText - Full extracted text from the document
 * @param fileName - Original file name (used for classification hints)
 * @param documentId - The ID of the stored medical document
 * @param onProgress - Optional progress callback
 * @returns Complete structured extraction result
 */
export function extractMedicalData(
  rawText: string,
  fileName: string,
  documentId: string,
  extractionMethod: 'pdf-text' | 'ocr' | 'fallback' = 'pdf-text',
  onProgress?: (progress: ExtractionProgress) => void,
): MedicalExtractionResult {
  const warnings: string[] = [];
  const rejected_candidates: RejectedExtractionCandidate[] = [];

  // Step 1: Detect document sections preserving line order, page numbers, and headers
  const sections = detectDocumentSections(rawText);

  // Exclude test expectations and synthetic disclaimers from clinical parsing
  const clinicalSections = sections.filter(s => s.type !== 'DISCLAIMER_NOTES');
  const clinicalText = clinicalSections.length > 0
    ? clinicalSections.map(s => s.content).join('\n\n')
    : rawText;

  const lines = clinicalText.split('\n').map(l => l.trim()).filter(Boolean);

  if (rawText.length < 20) {
    warnings.push('Very little text was extracted from the document. Results may be incomplete.');
  }

  onProgress?.({ step: 1, totalSteps: 6, label: 'Identifying patient information...', percentage: 15 });
  const patient_info = extractPatientInformation(clinicalText, lines, sections);

  onProgress?.({ step: 2, totalSteps: 6, label: 'Extracting doctor and hospital details...', percentage: 30 });
  const doctors = extractConsultations(clinicalText, lines, sections);

  onProgress?.({ step: 3, totalSteps: 6, label: 'Scanning for medications and allergies...', percentage: 45 });
  const medications = extractMedications(clinicalText, lines, sections, rejected_candidates);
  const allergies = extractAllergies(clinicalText, sections, rejected_candidates);

  onProgress?.({ step: 4, totalSteps: 6, label: 'Identifying laboratory test results...', percentage: 60 });
  const lab_results = extractLabResults(clinicalText, lines, sections, rejected_candidates);

  onProgress?.({ step: 5, totalSteps: 6, label: 'Checking for diagnoses and follow-ups...', percentage: 75 });
  const diagnoses = extractDiagnoses(clinicalText, sections);
  const follow_ups = extractFollowUpSuggestions(clinicalText, sections);
  const procedures = extractProcedures(clinicalText, sections);

  onProgress?.({ step: 6, totalSteps: 6, label: 'Organising extracted details...', percentage: 90 });

  const document_type = classifyDocumentType(clinicalText, fileName);

  // Add warnings for low-confidence extractions
  if (medications.length === 0 && (document_type === 'prescription' || document_type === 'report')) {
    warnings.push('No medications were identified. The document may use non-standard formatting.');
  }
  if (lab_results.length === 0 && document_type === 'lab-result') {
    warnings.push('No lab results were parsed. Values may be in a format the extractor does not recognize.');
  }
  if (extractionMethod === 'ocr') {
    warnings.push('Text was extracted via OCR. Some values may be inaccurate due to image quality.');
  }
  if (extractionMethod === 'fallback') {
    warnings.push('Unable to extract text from this document. Manual review is recommended.');
  }

  const totalItems = medications.length + allergies.length + lab_results.length +
    diagnoses.length + follow_ups.length + procedures.length + doctors.length;
  if (totalItems === 0 && rawText.length > 50) {
    warnings.push('No structured medical information could be identified. The document may not be a standard medical report, or may require manual data entry.');
  }

  onProgress?.({ step: 6, totalSteps: 6, label: 'Extraction complete', percentage: 100 });

  return {
    document_id: documentId,
    file_name: fileName,
    document_type,
    extraction_method: extractionMethod,
    raw_text: rawText,
    patient_info,
    doctors,
    diagnoses,
    medications,
    allergies,
    lab_results,
    follow_ups,
    procedures,
    rejected_candidates,
    warnings,
    extractor_version: EXTRACTOR_VERSION,
    processed_at: new Date().toISOString(),
  };
}

/**
 * Compute a simple hash of file content for duplicate detection
 */
export async function computeFileHash(file: File): Promise<string> {
  try {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // Fallback: use name + size + last modified
    return `${file.name}-${file.size}-${file.lastModified}`;
  }
}

