// ============================================================
// ZCare AI — curated medical lexicon
// ============================================================
// Small, deliberately conservative vocabulary used for question
// understanding, keyword expansion and deterministic medicine checks.
// It is NOT a drug-interaction database. Only well-established drug
// families are listed so that allergy / duplicate-therapy warnings are
// reliable. Anything not listed is reported as "not recognised".

export interface LabFamily {
  key: string;
  label: string;
  /** Words that, in a question, point to this family. */
  questionTerms: string[];
  /** Matches lab test names stored in the user's records. */
  testPattern: RegExp;
  /** Extra keywords for document text search. */
  searchTerms: string[];
}

export const LAB_FAMILIES: LabFamily[] = [
  {
    key: 'glucose',
    label: 'blood sugar (glucose / HbA1c)',
    questionTerms: ['sugar', 'glucose', 'hba1c', 'a1c', 'glycated', 'glycosylated', 'fbs', 'ppbs', 'rbs', 'diabetes', 'diabetic'],
    testPattern: /glucose|sugar|\bfbs\b|\bppbs\b|\brbs\b|hba1c|\ba1c\b|glycated|glycosylated/i,
    searchTerms: ['glucose', 'sugar', 'hba1c', 'diabetes', 'diabetic'],
  },
  {
    key: 'lipids',
    label: 'cholesterol (lipid profile)',
    questionTerms: ['cholesterol', 'lipid', 'lipids', 'ldl', 'hdl', 'triglyceride', 'triglycerides', 'vldl'],
    testPattern: /cholesterol|lipid|\bldl\b|\bhdl\b|triglycer|\bvldl\b/i,
    searchTerms: ['cholesterol', 'lipid', 'ldl', 'hdl', 'triglyceride'],
  },
  {
    key: 'kidney',
    label: 'kidney function',
    questionTerms: ['kidney', 'kidneys', 'renal', 'creatinine', 'urea', 'bun', 'egfr', 'gfr', 'uric'],
    testPattern: /creatinine|urea|\bbun\b|gfr|uric acid|renal|kidney/i,
    searchTerms: ['kidney', 'renal', 'creatinine', 'urea', 'egfr'],
  },
  {
    key: 'liver',
    label: 'liver function',
    questionTerms: ['liver', 'alt', 'ast', 'sgpt', 'sgot', 'bilirubin', 'lft', 'ggt', 'alp', 'albumin'],
    testPattern: /\balt\b|\bast\b|sgpt|sgot|bilirubin|alkaline phosphatase|\balp\b|\bggt\b|albumin|liver/i,
    searchTerms: ['liver', 'bilirubin', 'sgpt', 'sgot', 'alt', 'ast'],
  },
  {
    key: 'thyroid',
    label: 'thyroid',
    questionTerms: ['thyroid', 'tsh', 't3', 't4', 'thyroxine'],
    testPattern: /\btsh\b|\bt3\b|\bt4\b|thyro/i,
    searchTerms: ['thyroid', 'tsh', 't3', 't4'],
  },
  {
    key: 'blood_count',
    label: 'blood count (haemoglobin, WBC, platelets)',
    questionTerms: ['cbc', 'blood count', 'hemoglobin', 'haemoglobin', 'hb', 'wbc', 'rbc', 'platelet', 'platelets', 'anemia', 'anaemia', 'anemic', 'anaemic', 'iron', 'ferritin'],
    testPattern: /h(a)?emoglobin|\bhb\b|\bwbc\b|\brbc\b|platelet|h(a)?ematocrit|\bpcv\b|\bmcv\b|\bmch\b|ferritin|\biron\b|white blood|red blood|leukocyte|neutrophil|lymphocyte/i,
    searchTerms: ['haemoglobin', 'hemoglobin', 'anaemia', 'anemia', 'platelet', 'wbc', 'iron'],
  },
  {
    key: 'vitamins',
    label: 'vitamins (B12, D, folate)',
    questionTerms: ['vitamin', 'vitamins', 'b12', 'folate', 'folic', 'cobalamin'],
    testPattern: /vitamin|\bb12\b|cobalamin|folate|folic|25.?oh|\bd3\b/i,
    searchTerms: ['vitamin', 'b12', 'folate', 'deficiency'],
  },
  {
    key: 'inflammation',
    label: 'inflammation markers (CRP, ESR)',
    questionTerms: ['crp', 'esr', 'inflammation', 'inflammatory'],
    testPattern: /\bcrp\b|c.reactive|\besr\b|sedimentation/i,
    searchTerms: ['crp', 'esr', 'inflammation', 'infection'],
  },
  {
    key: 'electrolytes',
    label: 'electrolytes and minerals',
    questionTerms: ['sodium', 'potassium', 'chloride', 'electrolyte', 'electrolytes', 'calcium', 'magnesium'],
    testPattern: /sodium|potassium|chloride|electrolyte|calcium|magnesium/i,
    searchTerms: ['sodium', 'potassium', 'calcium', 'electrolyte'],
  },
  {
    key: 'urine',
    label: 'urine tests',
    questionTerms: ['urine', 'urinalysis', 'microalbumin'],
    testPattern: /urine|urinalysis|microalbumin/i,
    searchTerms: ['urine', 'protein', 'microalbumin'],
  },
];

export interface SymptomEntry {
  key: string;
  label: string;
  terms: string[];
  /** Lab families commonly checked for this symptom (used for relevance and "not recorded" notes). */
  relatedLabs: string[];
  searchTerms: string[];
}

export const SYMPTOMS: SymptomEntry[] = [
  { key: 'fatigue', label: 'tiredness / fatigue', terms: ['tired', 'tiredness', 'fatigue', 'fatigued', 'exhausted', 'exhaustion', 'weak', 'weakness', 'lethargic', 'lethargy', 'no energy', 'low energy', 'sleepy', 'drowsy'], relatedLabs: ['blood_count', 'glucose', 'thyroid', 'vitamins', 'kidney'], searchTerms: ['fatigue', 'tired', 'weakness', 'lethargy', 'energy'] },
  { key: 'dizziness', label: 'dizziness', terms: ['dizzy', 'dizziness', 'lightheaded', 'light headed', 'giddy', 'giddiness', 'vertigo'], relatedLabs: ['blood_count', 'glucose', 'electrolytes'], searchTerms: ['dizziness', 'giddiness', 'vertigo', 'blood pressure'] },
  { key: 'headache', label: 'headache', terms: ['headache', 'headaches', 'migraine'], relatedLabs: [], searchTerms: ['headache', 'migraine', 'blood pressure'] },
  { key: 'thirst_urination', label: 'thirst or frequent urination', terms: ['thirsty', 'thirst', 'frequent urination', 'urinating often', 'peeing a lot', 'urinate often'], relatedLabs: ['glucose', 'kidney'], searchTerms: ['thirst', 'urination', 'polyuria', 'sugar'] },
  { key: 'muscle_pain', label: 'muscle pain or cramps', terms: ['muscle pain', 'muscle ache', 'muscle aches', 'cramps', 'cramp', 'body ache', 'body pain', 'myalgia'], relatedLabs: ['electrolytes', 'vitamins'], searchTerms: ['muscle', 'cramp', 'myalgia', 'ache'] },
  { key: 'numbness', label: 'numbness or tingling', terms: ['numb', 'numbness', 'tingling', 'pins and needles', 'burning feet'], relatedLabs: ['vitamins', 'glucose'], searchTerms: ['numbness', 'tingling', 'neuropathy'] },
  { key: 'hair_loss', label: 'hair loss', terms: ['hair loss', 'hair fall', 'losing hair', 'hairfall'], relatedLabs: ['thyroid', 'blood_count', 'vitamins'], searchTerms: ['hair', 'alopecia'] },
  { key: 'weight_change', label: 'weight change', terms: ['weight gain', 'gaining weight', 'weight loss', 'losing weight', 'lost weight'], relatedLabs: ['thyroid', 'glucose'], searchTerms: ['weight'] },
  { key: 'palpitations', label: 'palpitations', terms: ['palpitation', 'palpitations', 'heart racing', 'racing heart', 'fast heartbeat', 'irregular heartbeat'], relatedLabs: ['thyroid', 'electrolytes', 'blood_count'], searchTerms: ['palpitation', 'heart rate', 'ecg'] },
  { key: 'swelling', label: 'swelling', terms: ['swelling', 'swollen', 'puffy', 'edema', 'oedema'], relatedLabs: ['kidney', 'liver'], searchTerms: ['swelling', 'edema', 'oedema'] },
  { key: 'skin', label: 'rash or itching', terms: ['rash', 'itch', 'itching', 'itchy', 'hives', 'eczema', 'skin allergy'], relatedLabs: [], searchTerms: ['rash', 'itching', 'hives', 'skin', 'allergy'] },
  { key: 'cough', label: 'cough', terms: ['cough', 'coughing'], relatedLabs: [], searchTerms: ['cough'] },
  { key: 'breathless', label: 'breathlessness', terms: ['breathless', 'short of breath', 'shortness of breath', 'out of breath', 'wheezing', 'wheeze'], relatedLabs: ['blood_count'], searchTerms: ['breathlessness', 'dyspnea', 'wheeze', 'asthma'] },
  { key: 'digestive', label: 'stomach or digestion problems', terms: ['nausea', 'nauseous', 'vomiting', 'acidity', 'heartburn', 'stomach pain', 'abdominal pain', 'constipation', 'diarrhea', 'diarrhoea', 'bloating', 'gastric'], relatedLabs: ['liver', 'kidney'], searchTerms: ['nausea', 'vomiting', 'acidity', 'gastritis', 'abdominal'] },
  { key: 'sleep', label: 'sleep problems', terms: ['insomnia', "can't sleep", 'cannot sleep', 'trouble sleeping', 'poor sleep'], relatedLabs: ['thyroid'], searchTerms: ['sleep', 'insomnia'] },
  { key: 'mood', label: 'low mood or anxiety', terms: ['anxious', 'anxiety', 'stressed', 'stress', 'depressed', 'low mood', 'sad all the time'], relatedLabs: ['thyroid', 'vitamins'], searchTerms: ['anxiety', 'depression', 'mood', 'stress'] },
  { key: 'fever', label: 'fever', terms: ['fever', 'feverish', 'temperature', 'chills'], relatedLabs: ['blood_count', 'inflammation'], searchTerms: ['fever', 'infection'] },
  { key: 'joint_pain', label: 'joint pain', terms: ['joint pain', 'joints hurt', 'knee pain', 'back pain', 'arthritis'], relatedLabs: ['inflammation', 'vitamins'], searchTerms: ['joint', 'arthritis', 'pain'] },
  { key: 'vision', label: 'vision changes', terms: ['blurred vision', 'blurry vision', 'vision problem'], relatedLabs: ['glucose'], searchTerms: ['vision', 'eye', 'retina'] },
];

export interface DrugClass {
  key: string;
  label: string;
  members: string[];
}

/** Well-established drug families (generic names, lower-case). */
export const DRUG_CLASSES: DrugClass[] = [
  { key: 'penicillins', label: 'penicillin-type antibiotics', members: ['penicillin', 'amoxicillin', 'ampicillin', 'amoxicillin-clavulanate', 'cloxacillin', 'flucloxacillin', 'dicloxacillin', 'piperacillin'] },
  { key: 'cephalosporins', label: 'cephalosporin antibiotics', members: ['cefixime', 'ceftriaxone', 'cephalexin', 'cefalexin', 'cefuroxime', 'cefpodoxime', 'cefadroxil', 'cefazolin', 'cefdinir'] },
  { key: 'sulfonamides', label: 'sulfonamide ("sulfa") antibiotics', members: ['sulfamethoxazole', 'co-trimoxazole', 'sulfadiazine'] },
  { key: 'macrolides', label: 'macrolide antibiotics', members: ['azithromycin', 'clarithromycin', 'erythromycin'] },
  { key: 'fluoroquinolones', label: 'fluoroquinolone antibiotics', members: ['ciprofloxacin', 'levofloxacin', 'ofloxacin', 'moxifloxacin', 'norfloxacin'] },
  { key: 'tetracyclines', label: 'tetracycline antibiotics', members: ['doxycycline', 'minocycline', 'tetracycline'] },
  { key: 'nsaids', label: 'NSAID pain relievers', members: ['ibuprofen', 'diclofenac', 'naproxen', 'aspirin', 'mefenamic acid', 'ketorolac', 'aceclofenac', 'indomethacin', 'piroxicam', 'etoricoxib', 'celecoxib', 'nimesulide'] },
  { key: 'paracetamol', label: 'paracetamol (acetaminophen)', members: ['paracetamol', 'acetaminophen'] },
  { key: 'opioids', label: 'opioid pain relievers', members: ['tramadol', 'codeine', 'morphine', 'tapentadol', 'oxycodone'] },
  { key: 'statins', label: 'statins (cholesterol medicines)', members: ['atorvastatin', 'rosuvastatin', 'simvastatin', 'pravastatin', 'lovastatin', 'pitavastatin'] },
  { key: 'ace_inhibitors', label: 'ACE inhibitors (blood pressure)', members: ['lisinopril', 'enalapril', 'ramipril', 'perindopril', 'captopril'] },
  { key: 'arbs', label: 'ARBs (blood pressure)', members: ['losartan', 'telmisartan', 'valsartan', 'olmesartan', 'irbesartan', 'candesartan'] },
  { key: 'beta_blockers', label: 'beta blockers', members: ['metoprolol', 'atenolol', 'propranolol', 'bisoprolol', 'carvedilol', 'nebivolol'] },
  { key: 'ccbs', label: 'calcium channel blockers (blood pressure)', members: ['amlodipine', 'nifedipine', 'cilnidipine', 'diltiazem', 'verapamil'] },
  { key: 'diuretics', label: 'diuretics ("water pills")', members: ['hydrochlorothiazide', 'chlorthalidone', 'furosemide', 'torsemide', 'spironolactone', 'indapamide'] },
  { key: 'biguanides', label: 'metformin (diabetes)', members: ['metformin'] },
  { key: 'sulfonylureas', label: 'sulfonylureas (diabetes)', members: ['glimepiride', 'gliclazide', 'glipizide', 'glibenclamide', 'glyburide'] },
  { key: 'dpp4', label: 'DPP-4 inhibitors (diabetes)', members: ['sitagliptin', 'vildagliptin', 'teneligliptin', 'linagliptin', 'saxagliptin'] },
  { key: 'sglt2', label: 'SGLT2 inhibitors (diabetes)', members: ['dapagliflozin', 'empagliflozin', 'canagliflozin'] },
  { key: 'insulins', label: 'insulin', members: ['insulin', 'insulin glargine', 'insulin aspart', 'insulin lispro'] },
  { key: 'ppis', label: 'proton pump inhibitors (acidity)', members: ['pantoprazole', 'omeprazole', 'esomeprazole', 'rabeprazole', 'lansoprazole'] },
  { key: 'antihistamines', label: 'antihistamines (allergy)', members: ['cetirizine', 'levocetirizine', 'loratadine', 'desloratadine', 'fexofenadine', 'chlorpheniramine', 'pheniramine', 'diphenhydramine'] },
  { key: 'anticoagulants', label: 'anticoagulants (blood thinners)', members: ['warfarin', 'apixaban', 'rivaroxaban', 'dabigatran', 'heparin'] },
  { key: 'antiplatelets', label: 'antiplatelet medicines', members: ['clopidogrel', 'ticagrelor', 'prasugrel'] },
  { key: 'thyroid_hormone', label: 'thyroid hormone', members: ['levothyroxine', 'thyroxine'] },
  { key: 'corticosteroids', label: 'corticosteroids (steroids)', members: ['prednisolone', 'prednisone', 'dexamethasone', 'methylprednisolone', 'hydrocortisone', 'budesonide'] },
  { key: 'ssris', label: 'SSRI antidepressants', members: ['sertraline', 'fluoxetine', 'escitalopram', 'paroxetine', 'citalopram'] },
  { key: 'benzodiazepines', label: 'benzodiazepines (sedatives)', members: ['alprazolam', 'clonazepam', 'lorazepam', 'diazepam'] },
  { key: 'leukotriene', label: 'leukotriene blockers (asthma/allergy)', members: ['montelukast'] },
  { key: 'bronchodilators', label: 'inhaled bronchodilators', members: ['salbutamol', 'albuterol', 'formoterol', 'tiotropium'] },
  { key: 'supplements', label: 'vitamin / mineral supplements', members: ['vitamin d', 'vitamin d3', 'cholecalciferol', 'vitamin b12', 'methylcobalamin', 'folic acid', 'iron', 'calcium', 'multivitamin'] },
];

/**
 * Drug families where an allergy to one calls for caution with the other.
 * (Kept to the widely taught pairing only.)
 */
export const RELATED_ALLERGY_CLASSES: Record<string, string[]> = {
  penicillins: ['cephalosporins'],
  cephalosporins: ['penicillins'],
};

/** Common brand names (India) mapped to generic names. Only unambiguous, well-known brands. */
export const BRAND_TO_GENERIC: Record<string, string[]> = {
  dolo: ['paracetamol'],
  crocin: ['paracetamol'],
  calpol: ['paracetamol'],
  combiflam: ['ibuprofen', 'paracetamol'],
  brufen: ['ibuprofen'],
  ecosprin: ['aspirin'],
  disprin: ['aspirin'],
  voveran: ['diclofenac'],
  meftal: ['mefenamic acid'],
  augmentin: ['amoxicillin-clavulanate'],
  glycomet: ['metformin'],
  thyronorm: ['levothyroxine'],
  eltroxin: ['levothyroxine'],
  pantocid: ['pantoprazole'],
  omez: ['omeprazole'],
  telma: ['telmisartan'],
  amlong: ['amlodipine'],
  azithral: ['azithromycin'],
  azee: ['azithromycin'],
  allegra: ['fexofenadine'],
  montair: ['montelukast'],
  zifi: ['cefixime'],
  monocef: ['ceftriaxone'],
  cetzine: ['cetirizine'],
  shelcal: ['calcium', 'vitamin d3'],
};

/** Plain-language aliases. */
const GENERIC_ALIASES: Record<string, string> = {
  'acetaminophen': 'paracetamol',
  'co-amoxiclav': 'amoxicillin-clavulanate',
  'amoxiclav': 'amoxicillin-clavulanate',
  'amoxicillin clavulanate': 'amoxicillin-clavulanate',
  'trimethoprim-sulfamethoxazole': 'co-trimoxazole',
  'bactrim': 'co-trimoxazole',
  'septran': 'co-trimoxazole',
  'cefalexin': 'cephalexin',
  'albuterol': 'salbutamol',
  'thyroxine': 'levothyroxine',
  'cholecalciferol': 'vitamin d3',
  'methylcobalamin': 'vitamin b12',
};

let cachedDrugNames: string[] | null = null;

/** All recognised generic drug names, longest first (so "insulin glargine" wins over "insulin"). */
export function knownDrugNames(): string[] {
  if (!cachedDrugNames) {
    const names = new Set<string>();
    for (const c of DRUG_CLASSES) c.members.forEach(m => names.add(m));
    Object.keys(GENERIC_ALIASES).forEach(a => names.add(a));
    cachedDrugNames = [...names].sort((a, b) => b.length - a.length);
  }
  return cachedDrugNames;
}

/** Map a drug name or brand to canonical generic names. */
export function canonicalDrugNames(name: string): string[] {
  const n = name.toLowerCase().trim().replace(/\s+/g, ' ');
  if (!n) return [];
  if (GENERIC_ALIASES[n]) return [GENERIC_ALIASES[n]];
  const firstWord = n.split(/[\s\d]/)[0];
  if (BRAND_TO_GENERIC[firstWord]) return BRAND_TO_GENERIC[firstWord];
  return [n];
}

/** Drug classes a (generic) medicine belongs to. Combination products map to every component's class. */
export function drugClassesFor(name: string): DrugClass[] {
  const generics = canonicalDrugNames(name);
  const result: DrugClass[] = [];
  for (const g of generics) {
    for (const c of DRUG_CLASSES) {
      const hit = c.members.some(m => g === m || g.startsWith(m + ' ') || g.startsWith(m + '-') || (m.includes('-') && g === m));
      if (hit && !result.includes(c)) result.push(c);
    }
    // amoxicillin-clavulanate is a penicillin
    if (g.startsWith('amoxicillin') && !result.some(c => c.key === 'penicillins')) {
      const pen = DRUG_CLASSES.find(c => c.key === 'penicillins');
      if (pen) result.push(pen);
    }
  }
  return result;
}

/**
 * Classes implied by an allergy entry, e.g. "Penicillin" -> penicillins,
 * "Sulfa drugs" -> sulfonamides, "NSAIDs" -> nsaids, "Amoxicillin" -> penicillins.
 */
export function allergyClasses(allergen: string): DrugClass[] {
  const a = allergen.toLowerCase();
  const byKey = (k: string) => DRUG_CLASSES.find(c => c.key === k)!;
  const result: DrugClass[] = [];
  if (/penicillin/.test(a)) result.push(byKey('penicillins'));
  if (/cephalosporin|\bcef|\bceph/.test(a)) result.push(byKey('cephalosporins'));
  if (/sulfa|sulpha|sulfonamide|sulphonamide/.test(a)) result.push(byKey('sulfonamides'));
  if (/nsaid|anti-?inflammator/.test(a)) result.push(byKey('nsaids'));
  if (/macrolide/.test(a)) result.push(byKey('macrolides'));
  if (/quinolone/.test(a)) result.push(byKey('fluoroquinolones'));
  if (/\bstatins?\b/.test(a)) result.push(byKey('statins'));
  for (const c of drugClassesFor(a)) if (!result.includes(c)) result.push(c);
  return result;
}

export function findLabFamily(key: string): LabFamily | undefined {
  return LAB_FAMILIES.find(f => f.key === key);
}

export function labFamiliesForTest(testName: string): string[] {
  return LAB_FAMILIES.filter(f => f.testPattern.test(testName)).map(f => f.key);
}
