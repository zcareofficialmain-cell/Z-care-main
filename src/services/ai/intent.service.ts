// ============================================================
// ZCare AI — question understanding
// ============================================================
// Rule-based and deterministic: identifies what the question is about
// and which record categories are needed, so retrieval never has to
// load every table for every question.

import type { HealthTopic, QuestionAnalysis, RecordCategory } from '../../types/ai.types.ts';
import {
  BRAND_TO_GENERIC,
  LAB_FAMILIES,
  SYMPTOMS,
  canonicalDrugNames,
  drugClassesFor,
  knownDrugNames,
} from './medical-lexicon.ts';

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'can', 'could', 'did', 'do', 'does', 'for',
  'from', 'had', 'has', 'have', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'me', 'my', 'of', 'on', 'or',
  'our', 'please', 'should', 'so', 'tell', 'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these',
  'they', 'this', 'to', 'was', 'were', 'what', 'when', 'which', 'who', 'why', 'will', 'with', 'would', 'you',
  'your', 'am', 'any', 'about', 'also', 'all', 'just', 'get', 'got', 'feel', 'feeling', 'lot', 'very', 'much',
  'many', 'some', 'know', 'want', 'need', 'take', 'taking', 'since', 'last', 'recent', 'recently', 'now', 'ok',
]);

/** Normalise free text for matching: lower-case, unify quotes/dashes, collapse spaces. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Very light stemmer (good enough for keyword overlap). */
export function stem(word: string): string {
  let w = word;
  if (w.length > 5 && w.endsWith('ies')) w = w.slice(0, -3) + 'y';
  else if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith('es') && !w.endsWith('ses')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  return w;
}

export function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsTerm(haystack: string, term: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${escapeRegex(term)}([^a-z0-9]|$)`).test(haystack);
}

/** Find recognised medicines (generic or brand names) mentioned in free text. Returns canonical generic names. */
export function findDrugMentions(text: string): string[] {
  const t = normalizeText(text);
  const found: string[] = [];
  const consumed: Array<[number, number]> = [];
  for (const name of knownDrugNames()) {
    const re = new RegExp(`(^|[^a-z0-9])(${escapeRegex(name)})([^a-z0-9]|$)`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) {
      const start = m.index + m[1].length;
      const end = start + name.length;
      if (consumed.some(([s, e]) => start < e && end > s)) continue;
      consumed.push([start, end]);
      for (const g of canonicalDrugNames(name)) if (!found.includes(g)) found.push(g);
    }
  }
  for (const brand of Object.keys(BRAND_TO_GENERIC)) {
    if (containsTerm(t, brand)) {
      for (const g of BRAND_TO_GENERIC[brand]) if (!found.includes(g)) found.push(g);
    }
  }
  return found;
}

const TOPIC_RULES: Array<{ topic: HealthTopic; pattern: RegExp }> = [
  { topic: 'appointment_prep', pattern: /(discuss|ask|tell|mention|prepare|bring|raise).{0,40}(doctor|appointment|visit|check.?up|consultation)|next (appointment|visit|check.?up)|before (my|the) (appointment|visit)/ },
  { topic: 'summary', pattern: /summar|overview|overall health|my health (status|so far)|health status|full history|whole history|medical history|health history|everything (in|about) my/ },
  { topic: 'lab_trends', pattern: /trend|chang(e|ed|es|ing)|improv|wors(e|en|ening)|over time|compare|compared|going (up|down)|increas|decreas|better or worse|since last|previous (result|test|report)|last (result|test|report)|history of my (results|levels|tests)/ },
  { topic: 'labs', pattern: /\blab\b|labs|test result|blood test|blood work|bloodwork|report (say|show|mean|indicate)|results?\b|levels?\b|value|reading|\bscore\b|normal range/ },
  { topic: 'allergies', pattern: /allerg|reaction to|react to|intoleran|sensitive to/ },
  { topic: 'medications', pattern: /medicat|medicine|\bmeds?\b|tablet|pill|capsule|\bdrugs?\b|prescri|\bdose|dosage|supplement|injection/ },
  { topic: 'conditions', pattern: /condition|diagnos|disease|illness|disorder|chronic|what (problems|issues) do i have/ },
  {
    topic: 'consultations',
    pattern:
      /doctor|\bdr\b|physician|\bgp\b|consult|visit|specialist|hospital|clinic|\bseen\b|\bsaw\b|advice|advised|recommend|(dermat|cardiol|neurol|orthop|gastro|gyn|paediatric|pediatric|ophthalm|endocrin|pulmon|nephrol|oncol|psychiatr|urolog)\w*/,
  },
  { topic: 'reminders', pattern: /remind|upcoming|\bdue\b|schedul|follow.?up|vaccin|next (test|appointment|dose)/ },
  { topic: 'documents', pattern: /document|uploaded|\bscan(ned)?\b|\bfile\b|\bpdf\b|discharge|x-?ray|\bmri\b|ct scan|ultrasound|\becg\b|\bekg\b|echo/ },
  { topic: 'insurance', pattern: /insur|policy|policies|\bcover(ed|age)?\b|claim|premium|sum insured/ },
  { topic: 'profile', pattern: /my (age|weight|height|bmi|blood group)|how old am i/ },
];

const SUITABILITY_PATTERN = /(can|could|should|may|is it (ok|okay|safe|fine) (to|for me to)) i? ?(take|use|have|start|try)|(is|are) [a-z0-9 -]{0,40}(safe|ok|okay|suitable|fine|good) (for me|to take|with)|suitable for me|safe for me|together with|along with|at the same time|interact|interaction|combine|mix [a-z0-9 -]{0,30} with/;
const UNNAMED_MEDICINE = /\b(this|that|the|a|new) (medicine|medication|tablet|pill|drug|capsule|syrup)\b/;
const HISTORY_PATTERN = /history|previous|past|before|earlier|used to|ever|over (the )?(years|time)|trend|chang|compare|last (year|time)/;
const FOLLOW_UP_START = /^(and|also|what about|how about|is that|is it|are they|does that|does it|why|so|then|ok(ay)?|but)\b/;
const PRONOUN_REF = /\b(that|it|this|those|them|these|they)\b/;

const CATEGORY_PLAN: Record<HealthTopic, RecordCategory[]> = {
  symptoms: ['profile', 'medications', 'allergies', 'labs', 'consultations', 'diagnoses', 'document_text'],
  conditions: ['profile', 'diagnoses', 'consultations', 'medications', 'labs', 'document_text'],
  medications: ['medications', 'allergies'],
  medication_suitability: ['profile', 'medications', 'allergies', 'diagnoses', 'labs', 'consultations'],
  allergies: ['allergies', 'medications', 'consultations'],
  labs: ['labs', 'diagnoses', 'documents', 'consultations'],
  lab_trends: ['labs', 'diagnoses'],
  consultations: ['consultations', 'reminders', 'documents'],
  documents: ['documents', 'document_text', 'diagnoses'],
  reminders: ['reminders', 'consultations'],
  appointment_prep: ['profile', 'reminders', 'consultations', 'labs', 'medications', 'allergies', 'diagnoses'],
  insurance: ['insurance'],
  profile: ['profile'],
  summary: ['profile', 'diagnoses', 'medications', 'allergies', 'labs', 'consultations', 'reminders'],
  general: ['profile', 'medications', 'allergies', 'labs', 'diagnoses', 'consultations', 'document_text'],
};

/**
 * Analyse a question. `previous` (the last analysis in this conversation)
 * lets short follow-ups such as "and my cholesterol?" or "is that normal?"
 * inherit the earlier topic.
 */
export function analyzeQuestion(question: string, previous?: QuestionAnalysis | null): QuestionAnalysis {
  const normalized = normalizeText(question);
  const topics: HealthTopic[] = [];
  const add = (t: HealthTopic) => { if (!topics.includes(t)) topics.push(t); };

  // --- entities ---
  const mentionedDrugs = findDrugMentions(normalized);

  const labFamilies: string[] = [];
  for (const fam of LAB_FAMILIES) {
    if (fam.questionTerms.some(term => containsTerm(normalized, term))) labFamilies.push(fam.key);
  }

  const symptoms: string[] = [];
  for (const s of SYMPTOMS) {
    if (s.terms.some(term => containsTerm(normalized, term))) symptoms.push(s.key);
  }
  const symptomPhrase =
    /\bi (feel|am feeling|have been feeling|have been having|keep (getting|feeling|having)|am getting|get)\b|\bfeeling (very |so |really |quite )?(tired|weak|dizzy|sick|unwell|low|bad|off)\b|\bsymptoms?\b|why am i (so |always |often |feeling )|why do i (feel|get|keep)/.test(
      normalized,
    );

  const refersToUnnamedMedicine = UNNAMED_MEDICINE.test(normalized);
  const asksSuitability = SUITABILITY_PATTERN.test(normalized);

  // --- topics (order = priority) ---
  if (asksSuitability && (mentionedDrugs.length > 0 || refersToUnnamedMedicine || /medicine|medication|tablet|pill|drug/.test(normalized))) {
    add('medication_suitability');
  }
  if (symptoms.length > 0 || (symptomPhrase && !asksSuitability)) add('symptoms');
  for (const rule of TOPIC_RULES) {
    if (rule.pattern.test(normalized)) add(rule.topic);
  }
  if (labFamilies.length > 0 && !topics.includes('labs') && !topics.includes('lab_trends')) add('labs');
  if (topics.includes('lab_trends') && !topics.includes('labs') && (labFamilies.length > 0 || /result|level|test|report|value/.test(normalized))) add('labs');
  // "lab_trends" only makes sense for lab questions
  if (topics.includes('lab_trends') && !topics.includes('labs')) topics.splice(topics.indexOf('lab_trends'), 1);
  if (mentionedDrugs.length > 0 && !topics.includes('medications') && !topics.includes('medication_suitability')) add('medications');
  if (labFamilies.includes('glucose') && /diabet/.test(normalized)) add('conditions');

  // --- follow-up handling ---
  const wordCount = normalized.split(' ').filter(Boolean).length;
  const looksLikeFollowUp =
    !!previous &&
    (FOLLOW_UP_START.test(normalized) || (wordCount <= 7 && PRONOUN_REF.test(normalized)) || (wordCount <= 4 && topics.length === 0));

  let isFollowUp = false;
  // Reply to "Which medicine do you mean?" — e.g. just "ibuprofen".
  if (previous?.unnamedMedicine && mentionedDrugs.length > 0 && wordCount <= 6 && !topics.includes('medication_suitability')) {
    topics.unshift('medication_suitability');
    isFollowUp = true;
  }
  if (looksLikeFollowUp && previous) {
    isFollowUp = true;
    if (topics.length === 0) previous.topics.forEach(add);
    for (const d of previous.mentionedDrugs) if (!mentionedDrugs.includes(d) && mentionedDrugs.length === 0) mentionedDrugs.push(d);
    for (const f of previous.labFamilies) if (!labFamilies.includes(f) && labFamilies.length === 0) labFamilies.push(f);
    for (const s of previous.symptoms) if (!symptoms.includes(s) && symptoms.length === 0) symptoms.push(s);
  }

  if (topics.length === 0) add('general');

  // A medicine referred to as "this medicine" is only unnamed if a follow-up didn't supply one.
  const unnamedMedicine = refersToUnnamedMedicine && mentionedDrugs.length === 0;

  // Specific topics first; "general" never outranks a specific topic.
  const primaryTopic = topics[0];

  const categories: RecordCategory[] = [];
  for (const t of topics) {
    for (const c of CATEGORY_PLAN[t]) if (!categories.includes(c)) categories.push(c);
  }
  // A named doctor ("What did Dr. Rahul prescribe?") always needs the visit records.
  if (/\bdr\b|doctor|physician/.test(normalized) && !categories.includes('consultations')) categories.push('consultations');

  // Text used to find which visit/doctor is meant; follow-ups keep the earlier reference ("them", "it").
  const referenceText = isFollowUp && previous ? `${previous.referenceText ?? previous.normalized} ${normalized}`.slice(-600) : normalized;

  // --- keyword expansion for text search ---
  const searchTerms = new Set<string>(tokenize(normalized));
  for (const key of labFamilies) LAB_FAMILIES.find(f => f.key === key)?.searchTerms.forEach(t => searchTerms.add(stem(t)));
  for (const key of symptoms) SYMPTOMS.find(s => s.key === key)?.searchTerms.forEach(t => searchTerms.add(stem(t)));
  for (const d of mentionedDrugs) {
    searchTerms.add(stem(d));
    for (const c of drugClassesFor(d)) searchTerms.add(stem(c.key));
  }

  return {
    original: question,
    referenceText,
    normalized,
    topics,
    primaryTopic,
    categories,
    mentionedDrugs,
    labFamilies,
    symptoms,
    searchTerms: [...searchTerms].filter(Boolean),
    wantsHistory: HISTORY_PATTERN.test(normalized) || topics.includes('lab_trends') || topics.includes('summary'),
    unnamedMedicine,
    isFollowUp,
  };
}

/** Lab families worth checking for the symptoms in the question. */
export function relatedLabFamiliesForSymptoms(symptomKeys: string[]): string[] {
  const out: string[] = [];
  for (const key of symptomKeys) {
    for (const fam of SYMPTOMS.find(s => s.key === key)?.relatedLabs ?? []) if (!out.includes(fam)) out.push(fam);
  }
  return out;
}
