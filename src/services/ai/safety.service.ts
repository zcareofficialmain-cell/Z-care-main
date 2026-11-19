// ============================================================
// ZCare AI — medical safety layer
// ============================================================
// 1. assessQuestionSafety(): emergency / urgent detection and request
//    flags (medication changes, diagnosis requests, dosing questions).
// 2. sanitizeUntrustedText(): record and report text is DATA. Chat
//    control tokens and instruction-like phrases are neutralised before
//    the text reaches the model.
// 3. checkSentence() / SentenceStreamFilter / validateResponse():
//    model output is checked sentence by sentence, while streaming,
//    before anything is shown to the user.

import type {
  EmergencyKind,
  QuestionAnalysis,
  QuestionSafetyFlag,
  ResponseValidation,
  SafetyAssessment,
} from '../../types/ai.types.ts';
import { normalizeText } from './intent.service.ts';
import { knownDrugNames } from './medical-lexicon.ts';

// ------------------------------------------------------------
// 1. Question safety
// ------------------------------------------------------------

const EMERGENCY_RULES: Array<{ kind: EmergencyKind; pattern: RegExp }> = [
  { kind: 'self_harm', pattern: /\b(kill(ing)? myself|suicid\w*|end (my life|it all)|take my (own )?life|want to die(?! my| the| it)|wish i (was|were) dead|don'?t want to (live|be alive)|self.?harm|hurt(ing)? myself|cut(ting)? myself)\b/ },
  { kind: 'overdose', pattern: /\b(overdos\w*|took (way )?too many|taken (way )?too many|swallowed (a lot of|too many|all (my|the|of))|poison(ed|ing))\b/ },
  { kind: 'cardiac', pattern: /\b(chest (pain|pressure|tightness|discomfort|heaviness)|pain in (my |the )?chest|heart attack|crushing (pain|feeling)|pain (spreading|going|radiating) (to|into|down) (my )?(left )?(arm|jaw|shoulder))\b/ },
  { kind: 'breathing', pattern: /\b(can'?t breathe|cannot breathe|unable to breathe|struggling to breathe|difficulty (in )?breathing|hard to breathe|trouble breathing|gasping|choking|lips? (are |is )?(turning )?blue|severe(ly)? (short(ness)? of breath|breathless))\b/ },
  { kind: 'stroke', pattern: /\b(face (is )?droop\w*|drooping face|slurred speech|slurring|sudden(ly)? (weak(ness)?|numb(ness)?|confus(ed|ion)|can'?t (speak|talk|see|walk|move))|weak(ness)? on one side|numb(ness)? on one side|one side of (my |the )?(body|face)|worst headache|having a stroke)\b/ },
  { kind: 'anaphylaxis', pattern: /\b(throat (is )?(closing|swelling|tight\w*)|tongue (is )?swell\w*|swollen (tongue|throat)|anaphyla\w*|(face|lips?) (is |are )?swell\w*[^.?!]{0,40}breath\w*)\b/ },
  { kind: 'bleeding', pattern: /\b(bleeding (heavily|a lot|won'?t stop|that won'?t stop|non.?stop)|severe bleeding|heavy bleeding|vomit(ing|ed)? blood|cough(ing|ed)? (up )?blood|blood in (my )?vomit|black,? tarry stool)\b/ },
  { kind: 'seizure', pattern: /\b(seizure|seizing|convuls\w*|having a fit|fitting now)\b/ },
  { kind: 'unconscious', pattern: /\b(unconscious|passed out|fainted|not responding|unresponsive|collapsed|can'?t wake (him|her|them|up))\b/ },
];

const URGENT_RULES: RegExp[] = [
  /\b(blood in (my )?(urine|stool|poo|pee))\b/,
  /\b(high fever|fever)\b[^.?!]{0,40}\b([3-9]|three|four|five|several) days\b/,
  /\bfever\b[^.?!]{0,40}\b(stiff neck|rash)\b/,
  /\b(severe|unbearable|excruciating|worst ever) (pain|headache|abdominal pain|stomach pain)\b/,
  /\b(double(d)? (my )?dose|took (an )?extra dose|took (two|2) doses)\b/,
  /\b(allergic reaction|swelling)\b[^.?!]{0,40}\b(new )?(medicine|medication|tablet|pill|antibiotic)\b/,
  /\b(fainting|blackouts?|blacked out)\b/,
  /\b(sudden|rapid) (vision loss|loss of vision)\b/,
];

/** The serious symptom happened long ago (history), recently (needs prompt care), or is hypothetical. */
const LONG_PAST_MARKER = /\b(years? ago|months? ago|last year|last month|years? back|months? back|in the past|history of|used to|was diagnosed|recovered|had (a|an)? ?(heart attack|stroke|seizure|fit))\b/;
const RECENT_PAST_MARKER = /\b(yesterday|last night|earlier today|this morning|the other day|days? ago|last week|weeks? ago)\b/;
const HYPOTHETICAL_MARKER = /\b(what (are|is) (the )?(signs?|symptoms?|warning signs?)|what (should|do) i do if|how (do|would) i know if|what happens if|signs of|symptoms of|what to do if|in case of)\b/;
/** Informational questions about emergency conditions get the urgent banner ("If you notice this, call 112"). */
const EMERGENCY_TOPIC = /\b(stroke|heart attack|anaphyla\w*|seizure|overdose|chest pain|suicid\w*|hypoglyc\w*)\b/;

function glucoseEmergency(text: string): boolean {
  const m = text.match(/\b(sugar|glucose)\b[^.?!\d]{0,30}(\d{2,3})\b/);
  if (!m) return false;
  const value = Number(m[2]);
  const extreme = value < 55 || value > 400;
  const symptomatic = /\b(confus\w*|drows\w*|faint\w*|shak\w*|sweat\w*|vomit\w*|unconscious|can'?t (stay awake|think)|dizzy|breath\w*)\b/.test(text);
  return extreme && symptomatic;
}

export function assessQuestionSafety(question: string): SafetyAssessment {
  const t = normalizeText(question);
  const flags: QuestionSafetyFlag[] = [];
  const drugAlternation = knownDrugNames()
    .filter(n => n.length > 3)
    .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const medObject = new RegExp(`\\b(medicine|medication|meds|tablets?|pills?|dose|dosage|insulin|treatment|${drugAlternation})\\b`);

  if (/\b(stop|stopping|quit|skip|skipping|discontinue|come off|get off|reduce|lower|increase|raise|double|halve|change|switch|cut down|taper)\b/.test(t) && medObject.test(t)) {
    flags.push('medication_change');
  }
  if (
    /\b(what'?s wrong with me|diagnos(e|is) me|what (disease|illness|condition) (do i have|is (it|this)))\b/.test(t) ||
    /\b(do i have|have i got|could i have|might i have|is (it|this)|am i)\b.{0,25}\b(cancer|tumou?r|diabet\w*|thyroid (disease|problem)|an?(a)?emi\w*|infection|covid|tuberculosis|\btb\b|heart (disease|problem)|kidney (disease|problem|failure)|liver (disease|problem)|hypertension|high blood pressure|depress\w*|arthritis|asthma|pcos|pcod|hepatitis|hiv|something serious|serious)\b/.test(t)
  ) {
    flags.push('diagnosis_request');
  }
  if (/\b(what|which) (medicine|medication|tablet|pill|drug|antibiotic|painkiller)s? (should|can|do|could) i (take|use|buy|get)\b|\bprescribe\b|\brecommend (a |an |me |some )?(medicine|medication|tablet|drug|antibiotic|painkiller)\b/.test(t)) {
    flags.push('prescription_request');
  }
  if (/\b(how (much|many)|what dose|what dosage|maximum dose|max(imum)? (daily )?dose|how often can i take)\b/.test(t)) {
    flags.push('dosage_question');
  }
  if (/\b(interact\w*|together|at the same time|along with|combine|mix\w*)\b/.test(t) && medObject.test(t)) {
    flags.push('interaction_question');
  }

  const isLongPast = LONG_PAST_MARKER.test(t);
  const isRecentPast = RECENT_PAST_MARKER.test(t);
  const isHypothetical = HYPOTHETICAL_MARKER.test(t);

  for (const rule of EMERGENCY_RULES) {
    if (!rule.pattern.test(t)) continue;
    // Thoughts of self-harm always get crisis resources, past or present.
    if (rule.kind === 'self_harm') return { level: 'emergency', emergencyKind: 'self_harm', flags };
    if (isHypothetical) return { level: 'urgent', emergencyKind: rule.kind, flags };
    if (isLongPast) {
      if (rule.kind === 'overdose') return { level: 'urgent', emergencyKind: rule.kind, flags };
      continue; // e.g. "I had a heart attack years ago" is history, not an emergency
    }
    if (isRecentPast) return { level: 'urgent', emergencyKind: rule.kind, flags };
    return { level: 'emergency', emergencyKind: rule.kind, flags };
  }
  if (glucoseEmergency(t)) return { level: isLongPast || isRecentPast ? 'urgent' : 'emergency', emergencyKind: 'glucose', flags };
  if (URGENT_RULES.some(r => r.test(t))) return { level: 'urgent', flags };
  if (isHypothetical && EMERGENCY_TOPIC.test(t)) return { level: 'urgent', flags };
  return { level: 'none', flags };
}

const EMERGENCY_GUIDANCE: Record<EmergencyKind, string> = {
  cardiac: 'Chest pain or pressure can be a sign of a heart attack.',
  breathing: 'Severe difficulty breathing needs emergency care.',
  stroke: 'Sudden weakness, face drooping, slurred speech or a sudden severe headache can be signs of a stroke. Every minute counts.',
  anaphylaxis: 'Swelling of the throat, tongue or face with breathing trouble can be a severe allergic reaction (anaphylaxis). If an adrenaline auto-injector has been prescribed, use it now.',
  self_harm: "You don't have to face this alone. Please reach out right now.",
  overdose: 'Taking too much of a medicine can be dangerous even if you feel fine at first.',
  bleeding: 'Heavy or uncontrolled bleeding, or vomiting or coughing up blood, needs emergency care.',
  seizure: 'A seizure needs urgent medical attention. Keep the person safe, do not put anything in their mouth, and time the seizure.',
  unconscious: 'If someone has collapsed or is not responding, check their breathing and call for help immediately.',
  glucose: 'A very low or very high blood sugar with symptoms like confusion, shaking, sweating, drowsiness or vomiting can become dangerous quickly. If you can safely swallow and your sugar is low, take a fast-acting sugar source while help is on the way.',
};

/** Deterministic response for emergencies. The language model is never used for these. */
export function emergencyResponse(kind: EmergencyKind): string {
  const lines = [`**This may be a medical emergency.** ${EMERGENCY_GUIDANCE[kind]}`, ''];
  if (kind === 'self_harm') {
    lines.push(
      '- In India, call **Tele-MANAS on 14416** (free, 24×7) to talk to a trained counsellor.',
      '- If you are in immediate danger, call **112**.',
      '- Outside India, call your local emergency number or a local crisis line.',
      '- If you can, tell someone you trust and stay with them.',
    );
  } else {
    lines.push(
      '- **Call 112** (India emergency number) or **108** for an ambulance, or your local emergency number.',
      '- Or go to the nearest hospital emergency department now.',
      '- Do not drive yourself if you feel unwell.',
    );
  }
  lines.push('', 'I am an information tool and cannot help in an emergency. Please contact emergency services first.');
  return lines.join('\n');
}

export function urgentNotice(): string {
  return 'What you describe may need prompt medical attention. Please contact your doctor today, or call 112 / go to an emergency department if it gets worse.';
}

// ------------------------------------------------------------
// 2. Untrusted text sanitisation
// ------------------------------------------------------------

const CONTROL_TOKENS = /<\|[^|>]{0,40}\|>|\[\/?INST\]|<\/?s>|<\/?think>|<\/?(system|assistant|user|tool)>/gi;
const ROLE_PREFIX = /(^|\n)\s*(system|assistant|user|instructions?|###\s*\w+)\s*:/gi;
const INJECTION = /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(instructions?|rules|prompt|above|previous|system)\b|\byou are now\b|\bnew instructions?\b|\bpretend (to be|you are)\b|\bact as (an?|the)\b/gi;

export interface SanitizedText {
  text: string;
  truncated: boolean;
  injectionRemoved: boolean;
}

/** Make record/report text safe to place in a prompt. Truncation is always marked, never silent. */
export function sanitizeUntrustedText(text: string | null | undefined, maxLen: number): SanitizedText {
  if (!text) return { text: '', truncated: false, injectionRemoved: false };
  let t = String(text).replace(CONTROL_TOKENS, ' ').replace(ROLE_PREFIX, '$1');
  let injectionRemoved = false;
  t = t.replace(INJECTION, () => {
    injectionRemoved = true;
    return '[instruction-like text removed]';
  });
  t = t.replace(/[<>]{3,}/g, ' ').replace(/\s+/g, ' ').trim();
  let truncated = false;
  if (t.length > maxLen) {
    const cut = t.slice(0, maxLen);
    const lastSpace = cut.lastIndexOf(' ');
    t = (lastSpace > maxLen * 0.6 ? cut.slice(0, lastSpace) : cut) + '… [truncated]';
    truncated = true;
  }
  return { text: t, truncated, injectionRemoved };
}

// ------------------------------------------------------------
// 3. Output validation
// ------------------------------------------------------------

export interface ValidationContext {
  /** Exact record text given to the model. */
  contextText: string;
  question: string;
  analysis: QuestionAnalysis;
  assessment: SafetyAssessment;
  recordCount: number;
  /** Lower-case names of the user's medicines (to recognise medication sentences). */
  medicationNames: string[];
}

export type RemovalReason =
  | 'medication_instruction'
  | 'unsafe_permission'
  | 'unrecorded_medicine'
  | 'unsupported_diagnosis'
  | 'unverified_value'
  | 'unretrieved_record'
  | 'discourages_care'
  | 'prompt_echo'
  | 'record_echo';

const REMOVAL_NOTES: Record<RemovalReason, string> = {
  medication_instruction: 'An instruction to start, stop or change a medicine was removed — only your doctor can advise that.',
  unsafe_permission: 'A statement that a medicine is safe or suitable for you was removed — only your doctor or pharmacist can confirm that.',
  unrecorded_medicine: 'A mention of a medicine that is not in your records was removed.',
  unsupported_diagnosis: 'A statement that sounded like a diagnosis was removed because your records do not support it.',
  unverified_value: 'A value or date that could not be matched to your records was removed.',
  unretrieved_record: 'A reference to a record that was not part of your retrieved records was removed.',
  discourages_care: 'A statement discouraging medical care was removed.',
  prompt_echo: 'Internal instructions were removed from the answer.',
  record_echo: '',
};

const MED_WORDS = /\b(medicines?|medications?|meds|tablets?|pills?|capsules?|dose|doses|dosage|insulin|drugs?|prescriptions?|antibiotics?)\b|\b(stop|quit|discontinue|skip)\s+(taking|using)\b/;
const CHANGE_VERB = /\b(stop|stopping|discontinue|quit|skip|cease|halt|come off|cut down on|cut back on|wean off|taper)\b/;
const DOSE_VERB = /\b(increase|decrease|reduce|raise|lower|double|halve|adjust|change|modify|alter)\b[^.]{0,30}\b(dose|dosage|medication|medicine|insulin|tablets?|pills?|units)\b/;
const DOSING_DIRECTIVE = /\b(you should|you can|you could|you may|try|start|begin|go ahead and)\b[^.]{0,25}\b(take|taking|use|using)\b[^.]{0,40}\b\d+(\.\d+)?\s?(mg|mcg|g|ml|units?|tablets?|pills?|capsules?)\b|^\s*(take|use)\s+\d/;
/** The change is negated ("don't stop…") … */
const NEGATED_CHANGE = /\b(don'?t|do not|never|not|shouldn'?t|should not|avoid)\s+(\w+\s+){0,3}(stop|stopping|discontinue|quit|skip|cease|halt|change|changing|adjust|increase|decrease|reduce|lower|raise|double|alter|modify|taper)/;
/** … or explicitly deferred to a clinician ("talk to your doctor before…", "your doctor may adjust…"). */
const DEFER_TO_CLINICIAN = /\b(ask|talk to|talk with|speak to|speak with|consult|check with|discuss (it |this |that )?with|contact)\b[^.]{0,30}\b(doctor|pharmacist|prescriber|physician|specialist)\b|\byour (doctor|pharmacist|prescriber|physician|specialist) (may|might|can|could|will|would|decides?)\b|\b(without|before|unless|until)\s+(first\s+)?(talking|speaking|consulting|checking|asking|discussing)/;
/** Reference thresholds ("below 5.7%") are general knowledge, not patient values. */
const REFERENCE_CUE = /(below|above|under|over|less than|more than|greater than|lower than|higher than|normal|range|target|goal|up to|between|around|about|typically|usually|ideally)\s*(is\s*|of\s*|range\s*)?\(?$/;
const QUOTING_RECORD = /\b(your (record|records|prescription)|as prescribed|listed|recorded|prescribed by|your doctor (prescribed|advised|asked))\b/;
const DIAGNOSIS_CLAIM =
  /(?:\byou (?:definitely |clearly |probably |likely |most likely )?(?:have|are suffering from|suffer from|are diagnosed with)|\bdiagnosed (?:you )?with|\b(?:confirmed|found) (?:that )?you have)\s+(?:a |an )?(?<condition>[a-z][a-z\- ]{2,40})/;
/** Promises about health that no record can support ("your heart health is definitely normal"). */
const HEALTH_GUARANTEE =
  /\bguarantee[sd]?\b|\b(definitely|certainly|absolutely) (normal|healthy|fine|okay|ok)\b|\bnothing (is )?wrong with (you|your)\b|\b(healthy|normal|fine) for sure\b/;
/** A visit/test/record said to be from today. */
const TODAY_CLAIM = /\b(today|this morning)\b[^.]{0,40}\b(visit|visited|consult\w*|record\w*|saw|seen|test\w*|result\w*|doctor)\b|\b(visit|visited|consult\w*|record\w*|saw|seen|test\w*|result\w*)\b[^.]{0,40}\b(today|this morning)\b/;
/** Saying something is missing is always allowed. */
const NOT_RECORDED = /\bnot (recorded|available|mentioned|listed|included|shown|in your records)\b|\bno (record|records|result|results|information|data|details)\b|\b(isn'?t|wasn'?t|aren'?t|weren'?t) (recorded|available|listed|mentioned)\b/;
const NEGATION = /\b(no|not|don'?t|do not|didn'?t|did not|never|none|without|isn'?t|wasn'?t|aren'?t|weren'?t|neither|nor)\b/;
/** A status attached to a test or measurement. */
const RESULT_STATUS = [
  /\b(results?|tests?|levels?|readings?|function|functioning|thyroid|blood pressure|bp|cholesterol|sugar|counts?|heart|kidneys?|liver)\b[^.]{0,40}\b(was|were|is|are|came back|showed?|shows|looks?|appears?)\b[^.]{0,25}\b(normal|abnormal|high|low|elevated|fine|healthy|good|within|properly|no issues|no signs)\b/,
  /\bnormal (bp|blood pressure|cardiovascular|heart|status|results?|levels?|readings?|function)\b/,
  /\b(supports?|indicates?|suggests?|confirms?|means?|shows?)\b[^.]{0,30}\b(a |your )?(normal|healthy) (cardiovascular|heart|status|health|results?|levels?|function|condition|blood pressure|baseline|range)\b/,
  /\b(revealed|showed|found|indicated|confirmed|detected)\b[^.]{0,20}\b(low|high|normal|elevated|abnormal|raised|reduced)\b[^.]{0,12}\b(blood pressure|bp|sugar|cholesterol|thyroid|heart rate|levels?|count)\b/,
  /\b(within|in) (the )?normal (limits|range)\b/,
  /\b(tests?|blood count|function test|blood work|scan)\b[^.]{0,30}\b(was|were|has been|have been) (performed|done|completed|carried out|taken|conducted|reviewed|checked)\b/,
  /\bhad (a |an |the )?[a-z ]{0,70}\b(tests?|blood count|scan)\b[^.]{0,10}\b(done|performed|completed)\b/,
];
/** Guessing why a symptom happens ("could be related to stress"). */
const CAUSE_GUESS = /\b(may|might|could|can|probably|likely)\b[^.]{0,15}\b(be )?(related to|due to|caused by|linked to|a result of|because of)\b/;
const VITAL_SIGN = /\b(heart rate|pulse rate|pulse|temperature|oxygen saturation|oxygen level|spo2|respiratory rate|bmi)\b/;
/** Talks about a particular medicine as if one exists ("the medication works to…", "your supplement"). */
const SPECIFIC_MEDICINE = /\b(the|this|that|your|these|those|each|every) (medications?|medicines?|supplements?|tablets?|pills?|drugs?|capsules?|prescription)\b(?! (is|are|was|were) not)/;
const PRESCRIBED_CLAIM =/\b(prescribed|put you on|started you on|gave you (a |some )?(medicine|medication|tablets?))\b/;
const CANNOT =/\b(cannot|can'?t|can not|unable to|no one can|nobody can|not possible to|not able to)\b/;
const SERIOUS_SPECULATION = /\b(may|might|could|possibly|probably)\s+(have|be having|be suffering from|be developing|indicate|mean|suggest)\b[^.]{0,40}\b(cancer|tumou?r|leuka?emia|lymphoma|hiv|aids|heart attack|stroke|kidney failure|liver failure|cirrhosis|tuberculosis|sepsis|dementia|multiple sclerosis)\b/;
/** "There's no need to stop it", "you can keep taking it", "you should continue". */
const STOP_VERDICT = /\b(no need|not necessary|unnecessary|needs? to|have to|should|shouldn'?t|can|could|safe to|fine to|okay to|ok to)\b[^.]{0,25}\b(stop|stopping|quit|quitting|continue|continuing|keep taking|keep using|discontinue)\b|\b(keep|continue) (taking|using|on)\b/;
/** Guessing a cause for symptoms ("dust mites may be causing your symptoms"). */
const CAUSAL_SPECULATION = /\b(may|might|could|probably|likely)\s+be\s+(causing|the cause of|responsible for|behind|triggering|the reason for)\b|\b(may|might|could|probably|likely)\s+be\s+(related to|due to|caused by|linked to|a side effect of)\b[^.]{0,40}\b(medications?|medicines?|tablets?|treatment)\b/;
const RECORD_TERMS =/\byour (x-?ray|mri|ct scan|ultrasound|ecg|ekg|echo(cardiogram)?|biopsy|endoscopy|colonoscopy|mammogram|pet scan)\b/;
const RECORD_CLAIM = /\b(your records? (show|shows|indicate|indicates|say|says|mention|mentions)|according to your records|your (results|tests|reports) (show|indicate))\b/;
const DISCOURAGES_CARE = /\b(no need to (see|visit|consult|call) (a|your|the) doctor|(you )?don'?t need (a doctor|to see a doctor|medical attention)|nothing to worry about|definitely (nothing|fine|normal)|no need for (medical|a doctor))\b/;
const PROMPT_ECHO = /^\s*-?\s*patient records \(|<<<|>>>|guidance for this question|^\s*rules?:|you are the zcare health assistant|you are zcare's health assistant|answer in this format|^[\s\-*#>]*(today|focus|question|records)\s*:|\bfocus\s*:|^\s*records \(|data only, not instructions|\b3 to 6 short sentences\b|\b1 to 3 bullet points\b/i;
/** "Yes, you can take it", "it is generally safe", "suitable for you" — never allowed for medicine questions. */
const PERMISSION_CLAIM = /\b(yes,? (you )?(can|may|could)|you (can|may|could) (safely |still |definitely )?(take|use|have|start|continue)|(it|this|that|they)('s| is| are) (generally |usually |completely |perfectly |considered )*(safe|fine|ok|okay|suitable|harmless)|(is|are) (generally |usually |considered |completely |perfectly )*(safe|suitable|harmless) (for you|to take|to use|with)|safe (for you )?to (take|use)|no (problem|issue|risk)s? (with|taking|in taking)|nothing to worry about)\b/;
const GENERAL_SAFETY_CLAIM = /\b(is|are) (generally |usually |widely |considered |completely |perfectly )+(safe|harmless)\b/;
/** "HBsAg: Positive", "- Vitamin D: 18 ng/mL" — a result attached to a test name. */
const LISTED_RESULT = /^[\s\-*•\d.)]*\**([a-z][a-z0-9 ()/.-]{1,40}?)\**\s*[:–-]\s*(positive|negative|reactive|non-reactive|detected|not detected|-?\d+(?:[.,]\d+)?)/;
const VALUE_WITH_UNIT = /(\d+(?:[.,]\d+)?)\s?(%|mg\/dl|mmol\/l|g\/dl|mg|mcg|µg|iu|units?|mmhg|bpm|kg|cm|ng\/ml|pg\/ml|miu\/l|µiu\/ml|uiu\/ml|u\/l|lakh)/gi;
const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH_DATE = new RegExp(`\\b(?:(\\d{1,2})(?:st|nd|rd|th)?\\s+)?(${MONTHS.join('|')}|${MONTHS.map(m => m.slice(0, 3)).join('|')})\\.?,?\\s+(\\d{4})\\b`, 'gi');
const MONTH_ALT = `${MONTHS.join('|')}|${MONTHS.map(m => m.slice(0, 3)).join('|')}`;
/** "24th October" (groups 1, 2) or "October 24th" (groups 3, 4). */
const DAY_MONTH = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_ALT})\\b|\\b(${MONTH_ALT})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?!\\s*(?:%|mg|g\\b|ml|units?))`, 'gi');

const FILLER_WORDS = new Set([
  'with', 'that', 'this', 'from', 'your', 'have', 'some', 'very', 'been', 'which', 'what', 'mild', 'severe', 'chronic',
  'acute', 'condition', 'problem', 'type', 'sure', 'certain', 'certainly', 'definitely', 'clearly', 'early', 'stage', 'form',
]);

/** The condition named in "you have <condition> …", cut at qualifiers ("for sure", "because", ","…). */
function claimedCondition(phrase: string): string[] {
  const head = phrase
    .toLowerCase()
    .split(/,|;|\b(for sure|for certain|definitely|because|since|which|that|as|and|but|according|based|from|in your|on|so)\b/)[0];
  return head.split(/[^a-z]+/).filter(w => w.length >= 4 && !FILLER_WORDS.has(w));
}

function supportedByContext(word: string, context: string): boolean {
  const prefix = word.slice(0, Math.max(4, word.length - 2)).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${prefix}`).test(context);
}

// ------------------------------------------------------------
// Facts parsed from the record text given to the model (memoised)
// ------------------------------------------------------------
type LabFlagName = 'high' | 'low' | 'normal' | 'critical' | null;
interface RecordFacts {
  /** Record text without reference ranges: numbers here are real recorded values. */
  recordedText: string;
  labs: Array<{ aliases: string[]; flag: LabFlagName }>;
  allergens: string[];
  currentMedicines: string;
  lineTokens: Array<Set<string>>;
  /** Doctor visits: identifying words (doctor, specialty, clinic) and all words of the line. */
  visits: Array<{ names: Set<string>; clinic: string; specialty: Set<string>; words: Set<string> }>;
}
const factsMemo = new Map<string, RecordFacts>();
const tokenSet = (text: string) => new Set(normalizeText(text).split(/[^a-z0-9]+/).filter(t => t.length >= 2));

/** Words that appear in many visits' notes and say nothing about who gave the advice. */
const ATTRIBUTION_GENERIC = new Set(['city', 'metro', 'recom', 'advis', 'advic', 'regul', 'routi', 'follo', 'neede', 'visit', 'docto', 'healt', 'reaso', 'notes', 'durin', 'recor', 'gener', 'about', 'which', 'their', 'there', 'these', 'those', 'also', 'with', 'your', 'that', 'this', 'from', 'have', 'were', 'been', 'will', 'into', 'clini', 'hospi', 'centr', 'cente', 'speci', 'consu', 'asses', 'check', 'care', 'were', 'said', 'told', 'gave', 'given', 'sugge', 'emphas', 'empha', 'note', 'mentio', 'menti', 'patie', 'recen', 'prior', 'befor', 'after', 'other', 'both', 'each', 'they', 'them', 'more', 'some', 'like', 'such', 'well', 'good', 'keep', 'make', 'sure', 'next', 'steps', 'step', 'contin', 'conti', 'maint', 'impor']);

/** Lower-case 5-letter word stems ("dermatologist" and "dermatology" both -> "derma"). */
function visitWords(text: string): string[] {
  return normalizeText(text).split(/[^a-z0-9]+/).filter(w => w.length >= 4).map(w => w.slice(0, 5));
}

/** True when a sentence credits one visit's doctor with advice that is only in another visit. */
export function misattributesVisit(sentence: string, visits: RecordFacts['visits']): boolean {
  if (visits.length < 2) return false;
  const words = visitWords(sentence);
  // A visit is named by its doctor/clinic name, or by a specialty title ("dermatologist", "cardiology") —
  // not by related words such as "physical" or "cardiovascular".
  const tokens = normalizeText(sentence).split(/[^a-z0-9]+/).filter(w => w.length >= 4);
  const titles = new Set(tokens.filter(w => /(ist|ists|ian|ians|logy)$/.test(w)).map(w => w.slice(0, 5)));
  const lower = normalizeText(sentence);
  const named = visits.filter(v => tokens.some(t => v.names.has(t.slice(0, 5))) || (v.clinic.length >= 4 && lower.includes(v.clinic)) || [...titles].some(t => v.specialty.has(t)));
  if (named.length !== 1) return false;
  const own = named[0].words;
  const elsewhere = new Set<string>();
  for (const v of visits) if (v !== named[0]) for (const w of v.words) if (!own.has(w)) elsewhere.add(w);
  return words.some(w => elsewhere.has(w) && !ATTRIBUTION_GENERIC.has(w) && !named[0].names.has(w) && !named[0].specialty.has(w));
}

export function recordFacts(contextText: string): RecordFacts {
  const hit = factsMemo.get(contextText);
  if (hit) return hit;
  const labs: RecordFacts['labs'] = [];
  const allergens: string[] = [];
  const current: string[] = [];
  const lineTokens: Array<Set<string>> = [];
  const visits: RecordFacts['visits'] = [];
  let section = '';
  for (const raw of contextText.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (!line.startsWith('- ') && line.endsWith(':')) {
      section = line.toUpperCase();
      continue;
    }
    if (!line.startsWith('- ')) continue;
    const body = line.slice(2);
    const tokens = tokenSet(body);
    if (tokens.size >= 6) lineTokens.push(tokens);
    if (section.startsWith('LAB RESULTS')) {
      const name = body.split(': ')[0];
      const flag = body.match(/— (HIGH|LOW|CRITICAL|normal)\b/);
      const key = normalizeText(name).replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
      const last = key.split(' ').pop() ?? '';
      const aliases = [key, ...(last.length >= 3 ? [last] : [])];
      if (aliases.some(a => a.includes('haemoglobin'))) aliases.push('hemoglobin');
      if (aliases.some(a => a.includes('hemoglobin'))) aliases.push('haemoglobin');
      labs.push({ aliases: [...new Set(aliases)].filter(Boolean), flag: flag ? (flag[1].toLowerCase() as LabFlagName) : null });
    } else if (section.startsWith('ALLERGIES')) {
      const allergen = body.split(' — ')[0].trim().toLowerCase();
      if (allergen.length >= 3) allergens.push(allergen);
    } else if (section.startsWith('DOCTOR VISITS')) {
      const head = body.match(/^\S+ — (.+?) \(([^)]*)\)(?:, ([^—]+?))? —/);
      if (head) {
        const names = new Set(visitWords(head[1]).filter(k => !ATTRIBUTION_GENERIC.has(k)));
        visits.push({ names, clinic: normalizeText(head[3] ?? '').trim(), specialty: new Set(visitWords(head[2]).filter(k => !ATTRIBUTION_GENERIC.has(k))), words: new Set(visitWords(body)) });
      }
    } else if (section.startsWith('CURRENT MEDICINES')) {
      current.push(body.toLowerCase());
    }
  }
  const facts: RecordFacts = {
    recordedText: contextText.toLowerCase().replace(/\(reference [^)]*\)/g, ' '),
    labs,
    allergens,
    currentMedicines: current.join('\n'),
    lineTokens,
    visits,
  };
  if (factsMemo.size > 8) factsMemo.clear();
  factsMemo.set(contextText, facts);
  return facts;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Status words in a sentence about one test ("your haemoglobin is low"). */
function claimedStatus(s: string): Array<'high' | 'low' | 'normal' | 'outside'> {
  const t = s.replace(/\b(normal|reference|healthy|target|usual|recommended) (range|limits?|levels?|values?)\b/g, 'range');
  const out: Array<'high' | 'low' | 'normal' | 'outside'> = [];
  if (/\b(high|higher|elevated|above|raised|increased)\b/.test(t)) out.push('high');
  if (/\b(low|lower|below|decreased|reduced|deficien\w*)\b/.test(t)) out.push('low');
  if (/\boutside\b/.test(t)) out.push('outside');
  const negatedNormal = /\b(not|isn'?t|aren'?t|no longer)\b[^.]{0,20}\b(normal|within|in range)\b/.test(t);
  if (!negatedNormal && /\b(normal|within (the )?range|in range|healthy)\b/.test(t)) out.push('normal');
  return out;
}

function valuePresent(value: string, haystack: string): boolean {
  const v = value.replace(',', '.');
  const n = Number(v);
  if (!Number.isFinite(n)) return true;
  // Accept the literal, its comma form, or the same number with trailing zeros dropped / added.
  const forms = new Set([value, v, String(n), n.toFixed(1), n.toFixed(2)]);
  for (const f of forms) {
    const re = new RegExp(`(^|[^0-9.])${f.replace('.', '\\.')}([^0-9]|$)`);
    if (re.test(haystack)) return true;
  }
  return false;
}

/** Returns a removal reason, or null if the sentence is acceptable. */
export function checkSentence(sentence: string, ctx: ValidationContext): RemovalReason | null {
  const s = normalizeText(sentence);
  if (!s) return null;
  if (PROMPT_ECHO.test(s)) return 'prompt_echo';

  const mentionsMedicine =
    MED_WORDS.test(s) ||
    ctx.medicationNames.some(n => n.length > 2 && s.includes(n)) ||
    knownDrugNames().some(n => n.length > 3 && s.includes(n));
  const quotingRecord = QUOTING_RECORD.test(s);

  if (mentionsMedicine && !quotingRecord) {
    const safe = NEGATED_CHANGE.test(s) || DEFER_TO_CLINICIAN.test(s);
    if ((CHANGE_VERB.test(s) || DOSE_VERB.test(s)) && !safe) return 'medication_instruction';
    if (DOSING_DIRECTIVE.test(s) && !/\b(doctor|pharmacist|label|leaflet)\b/.test(s)) return 'medication_instruction';
  }

  const context = ctx.contextText.toLowerCase();
  const contextCompact = context.replace(/-/g, '');

  // Medicine safety/suitability is never asserted by the model.
  const medicineQuestion =
    ctx.analysis.topics.includes('medication_suitability') ||
    ctx.assessment.flags.some(f => f === 'interaction_question' || f === 'dosage_question' || f === 'prescription_request' || f === 'medication_change');
  const hasAlert = /allergy alert|caution:/.test(context);
  if ((medicineQuestion || hasAlert) && PERMISSION_CLAIM.test(s)) return 'unsafe_permission';
  // In a medicine question, verdicts on stopping/continuing are removed even when the medicine is only "it".
  if (medicineQuestion && STOP_VERDICT.test(s) && !DEFER_TO_CLINICIAN.test(s)) return 'medication_instruction';
  if (CAUSAL_SPECULATION.test(s)) return 'unsupported_diagnosis';
  if (mentionsMedicine && GENERAL_SAFETY_CLAIM.test(s)) return 'unsafe_permission';

  if (DISCOURAGES_CARE.test(s)) return 'discourages_care';

  // Medicines that appear in neither the records nor the question are not about this patient.
  const question = ctx.question.toLowerCase();
  for (const name of knownDrugNames()) {
    if (name.length < 5) continue;
    if (new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(s) && !context.includes(name) && !question.includes(name)) {
      return 'unrecorded_medicine';
    }
  }

  // "Test: result" lines must name a test that exists in the records.
  const listed = s.match(LISTED_RESULT);
  if (listed && !/^(next steps?|steps?|answer|note|notes|tip|tips|possible factors|what (your records show|this means)|question|summary|reason|follow.?up|step \d+)$/.test(listed[1].trim())) {
    const words = claimedCondition(listed[1]);
    if (words.length > 0 && !words.some(w => supportedByContext(w, context))) return 'unverified_value';
  }
  const diagnosis = s.match(DIAGNOSIS_CLAIM);
  if (diagnosis) {
    const words = claimedCondition(diagnosis.groups?.condition ?? '');
    const supported = words.length === 0 || words.some(w => supportedByContext(w, context));
    if (!supported) return 'unsupported_diagnosis';
  }
  if (HEALTH_GUARANTEE.test(s) && !CANNOT.test(s)) return 'unsupported_diagnosis';
  const speculation = s.match(SERIOUS_SPECULATION);
  if (speculation && !context.includes(speculation[3])) return 'unsupported_diagnosis';

  const record = s.match(RECORD_TERMS);
  if (record && !contextCompact.includes(record[1].replace(/-/g, '').slice(0, 4))) return 'unretrieved_record';
  if (ctx.recordCount === 0 && RECORD_CLAIM.test(s)) return 'unretrieved_record';

  const facts = recordFacts(ctx.contextText);

  // An allergen must never be presented as a medicine the patient takes.
  if (/\b(taking|take|takes|you are on|you're on|prescribed|using)\b/.test(s) && !/allerg|\b(don'?t|do not|never|avoid)\b/.test(s)) {
    for (const allergen of facts.allergens) {
      if (new RegExp(`\\b${escapeRe(allergen)}\\b`).test(s) && !facts.currentMedicines.includes(allergen)) return 'unrecorded_medicine';
    }
  }

  // Words about a result ("normal", "high", "low") must agree with the record.
  const mentionedLabs = facts.labs.filter(l => l.flag && l.aliases.some(a => new RegExp(`\\b${escapeRe(a)}\\b`).test(s)));
  if (mentionedLabs.length === 1) {
    const actual = mentionedLabs[0].flag;
    const claims = claimedStatus(s);
    if (claims.length === 1 && actual !== 'critical') {
      const claim = claims[0];
      const contradicts =
        (actual === 'normal' && (claim === 'high' || claim === 'low' || claim === 'outside')) ||
        (actual === 'high' && (claim === 'low' || claim === 'normal')) ||
        (actual === 'low' && (claim === 'high' || claim === 'normal'));
      if (contradicts) return 'unverified_value';
    }
  }

  // "Today" is only in RECORDS as the current date — never as a visit, test or record date.
  const todayIso = facts.recordedText.match(/^today: (\d{4}-\d{2}-\d{2})/m)?.[1] ?? null;
  const recordedWithoutToday = facts.recordedText.replace(/^today: .*$/m, '');
  if (TODAY_CLAIM.test(s) && !NOT_RECORDED.test(s) && !(todayIso && recordedWithoutToday.includes(todayIso))) return 'unverified_value';

  const namesRecordedLab = facts.labs.some(l => l.aliases.some(a => new RegExp(`\\b${escapeRe(a)}\\b`).test(s)));
  // "Your thyroid result was normal", "supports a normal cardiovascular status": a status needs a recorded result.
  if (RESULT_STATUS.some(p => p.test(s)) && !namesRecordedLab && !NOT_RECORDED.test(s) && !CANNOT.test(s)) return 'unverified_value';
  // When the question is about a symptom or asks for a diagnosis, guessed causes are removed.
  if ((ctx.analysis.topics.includes('symptoms') || ctx.assessment.flags.includes('diagnosis_request')) && CAUSE_GUESS.test(s) && !NEGATION.test(s)) return 'unsupported_diagnosis';
  // Advice credited to the wrong doctor ("limit salt, as advised by the dermatologist").
  if (misattributesVisit(s, facts.visits)) return 'unverified_value';
  // Measurements the records do not contain ("your heart rate was …").
  const vital = s.match(VITAL_SIGN);
  if (vital && !NOT_RECORDED.test(s) && !facts.recordedText.includes(vital[0])) return 'unverified_value';
  // "Dr. X prescribed a medication", "the supplement is designed to…" when no medicine is recorded at all.
  const noMedicinesRecorded = !facts.currentMedicines && !/current medicines|past medicines/i.test(ctx.contextText);
  if (noMedicinesRecorded && (PRESCRIBED_CLAIM.test(s) || SPECIFIC_MEDICINE.test(s)) && !NEGATION.test(s) && !DEFER_TO_CLINICIAN.test(s)) return 'unrecorded_medicine';

  // Values and dates must be recorded values (reference-range limits don't count) or come from the question.
  const haystack = `${recordedWithoutToday}\n${ctx.question.toLowerCase()}`;
  for (const m of s.matchAll(VALUE_WITH_UNIT)) {
    if (valuePresent(m[1], haystack)) continue;
    const before = s.slice(Math.max(0, (m.index ?? 0) - 24), m.index ?? 0);
    if (REFERENCE_CUE.test(before)) continue;
    return 'unverified_value';
  }
  for (const m of s.matchAll(ISO_DATE)) {
    if (!haystack.includes(m[0])) return 'unverified_value';
  }
  for (const m of s.matchAll(MONTH_DATE)) {
    const monthIdx = MONTHS.findIndex(name => name.startsWith(m[2].toLowerCase().slice(0, 3)));
    const ym = `${m[3]}-${String(monthIdx + 1).padStart(2, '0')}`;
    if (monthIdx >= 0 && !haystack.includes(ym) && !haystack.includes(m[0].toLowerCase())) return 'unverified_value';
  }
  // Dates written without a year ("October 24th", "24 Oct") must match a recorded day and month.
  for (const m of s.matchAll(DAY_MONTH)) {
    const day = m[1] ?? m[4];
    const month = (m[2] ?? m[3]).toLowerCase().slice(0, 3);
    const monthIdx = MONTHS.findIndex(name => name.startsWith(month));
    if (monthIdx < 0 || !day) continue;
    const dd = day.padStart(2, '0');
    const iso = `-${String(monthIdx + 1).padStart(2, '0')}-${dd}`;
    const human = new RegExp(`\\b0?${Number(day)}(st|nd|rd|th)? ${month}|\\b${month}[a-z]* 0?${Number(day)}\\b`);
    if (!haystack.includes(iso) && !human.test(haystack)) return 'unverified_value';
  }

  // Near-verbatim copies of record lines add nothing (the facts are shown separately).
  const tokens = tokenSet(s);
  if (tokens.size >= 6) {
    for (const line of facts.lineTokens) {
      let shared = 0;
      for (const t of tokens) if (line.has(t)) shared++;
      if (shared / (tokens.size + line.size - shared) >= 0.7) return 'record_echo';
    }
  }
  return null;
}

/** Remove reasoning blocks / special tokens some small models emit. */
export function cleanModelText(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?(<\/think>|$)/gi, '')
    .replace(/<\/think>/gi, '')
    .replace(/<\|[^|>]{0,40}\|>/g, '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Split text into sentence units, keeping line breaks as separate units. */
/** "Dr. Priya" is not the end of a sentence. */
const ABBREVIATION_END = /(?:^|[\s(*_])(dr|mr|mrs|ms|prof|st|vs|e\.g|i\.e|approx|no)\.$/i;

export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let buf = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    buf += ch;
    const next = text[i + 1];
    if (ch === '\n') {
      out.push(buf);
      buf = '';
    } else if ((ch === '.' || ch === '!' || ch === '?') && (next === undefined || next === ' ' || next === '\n') && !(ch === '.' && ABBREVIATION_END.test(buf))) {
      if (next === ' ') {
        buf += ' ';
        i++;
      }
      out.push(buf);
      buf = '';
    }
  }
  if (buf) out.push(buf);
  return out;
}

const sentenceKey = (s: string) => normalizeText(s).replace(/[^a-z0-9]/g, '');

/**
 * Validates model output while it streams. Push tokens in; complete,
 * approved sentences come out. Unsafe sentences never reach the screen.
 */
export class SentenceStreamFilter {
  private buffer = '';
  private lastLoopCheck = 0;
  private emitted = new Set<string>();
  private repeats = 0;
  readonly reasons: RemovalReason[] = [];
  private readonly ctx: ValidationContext;
  /** Set when the model starts looping; the caller should interrupt generation. */
  degenerate = false;

  constructor(ctx: ValidationContext) {
    this.ctx = ctx;
  }

  private accept(sentence: string): string {
    if (sentence.trim() === '') return sentence.includes('\n') ? '\n' : '';
    const key = sentenceKey(sentence);
    if (key.length > 8 && this.emitted.has(key)) {
      this.repeats++;
      if (this.repeats >= 2) this.degenerate = true;
      return '';
    }
    const reason = checkSentence(sentence, this.ctx);
    if (reason) {
      this.reasons.push(reason);
      return sentence.endsWith('\n') ? '\n' : '';
    }
    if (key.length > 8) this.emitted.add(key);
    return sentence;
  }

  /** Feed a streamed token; returns newly approved text (possibly empty). */
  push(token: string): string {
    if (this.degenerate) return '';
    this.buffer += token;
    // Wait for reasoning blocks to close, then drop them.
    if (/<think>/i.test(this.buffer) && !/<\/think>/i.test(this.buffer)) return '';
    this.buffer = this.buffer.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<\/think>/gi, '').replace(/<\|[^|>]{0,40}\|>/g, '');
    // Loops that never end a sentence ("The report includes: The report includes: …").
    if (this.buffer.length > 240 && this.buffer.length - this.lastLoopCheck >= 60) {
      this.lastLoopCheck = this.buffer.length;
      const loop = this.buffer.match(/([\s\S]{12,120}?)(?:\s*\1){2,}/);
      if (loop && loop.index !== undefined) {
        this.degenerate = true;
        this.buffer = this.buffer.slice(0, loop.index + loop[1].length);
      }
    }
    // Very long unpunctuated runs are validated as one unit rather than held back.
    if (this.buffer.length > 700) this.buffer += '\n';
    const parts = splitSentences(this.buffer);
    if (parts.length <= 1) return '';
    // The last unit may be incomplete (e.g. "7." before "8%"): keep it buffered.
    const complete = parts.slice(0, -1);
    this.buffer = parts[parts.length - 1];
    return complete.map(p => this.accept(p)).join('');
  }

  flush(): string {
    const rest = cleanModelText(this.buffer);
    this.buffer = '';
    return splitSentences(rest).map(p => this.accept(p)).join('');
  }
}

/** Final pass over the complete answer: per-sentence checks plus required safety additions. */
export function validateResponse(raw: string, ctx: ValidationContext): ResponseValidation {
  const filter = new SentenceStreamFilter(ctx);
  let text = filter.push(cleanModelText(raw)) + filter.flush();
  text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

  // Echoed record lines are dropped silently (the facts are shown separately); everything else is reported.
  const notes = [...new Set(filter.reasons)].map(r => REMOVAL_NOTES[r]).filter(Boolean);
  const lower = text.toLowerCase();
  const additions: string[] = [];
  const flags = ctx.assessment.flags;
  const topics = ctx.analysis.topics;
  const medicineQuestion =
    topics.includes('medication_suitability') ||
    flags.includes('medication_change') ||
    flags.includes('dosage_question') ||
    flags.includes('interaction_question') ||
    flags.includes('prescription_request');

  let usedFallback = false;
  if (text.replace(/[^a-z]/gi, '').length < 25) {
    text = "I couldn't write a reliable explanation for this question. The facts from your records are shown here — please go through them with your doctor.";
    usedFallback = true;
  }

  if (flags.includes('medication_change') && !/(don'?t|do not|never) (stop|change|skip|adjust)/.test(lower)) {
    additions.push("Please don't stop, skip or change any prescribed medicine on your own — talk to your doctor first.");
  } else if (medicineQuestion && !/\b(doctor|pharmacist)\b/.test(lower)) {
    additions.push('Please confirm with your doctor or pharmacist before taking or changing any medicine.');
  }
  if (flags.includes('diagnosis_request') && !/\bdoctor\b/.test(lower)) {
    additions.push('Only a doctor can make a diagnosis — please discuss this with them.');
  }
  if (additions.length) text = `${text}\n\n${additions.join(' ')}`;

  // Allergy alerts computed from the records can never be omitted or contradicted.
  const alerts = [...ctx.contextText.matchAll(/^- ALLERGY ALERT: (.+)$/gm)].map(m => m[1]);
  const missingAlerts = alerts.filter(a => {
    const allergen = a.match(/allergy to (.+?) \(/)?.[1]?.toLowerCase();
    return allergen ? !text.toLowerCase().includes(allergen) : true;
  });
  if (missingAlerts.length) {
    text = `**Allergy alert:** ${missingAlerts.join(' ')} Do not take it unless a doctor who knows about this allergy confirms it is safe for you.\n\n${text}`;
  }

  return { text, removedSentences: filter.reasons.length, notes, usedFallback };
}
