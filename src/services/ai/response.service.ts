// ============================================================
// ZCare AI — deterministic answers (no language model involved)
// ============================================================
// Used for emergencies, clarifying questions, and the records-only
// fallback on devices that cannot run the local model.

import type { BuiltContext, EmergencyKind, PatientRecords, QuestionAnalysis } from '../../types/ai.types.ts';
import { emergencyResponse } from './safety.service.ts';

export function buildEmergencyAnswer(kind: EmergencyKind, records: PatientRecords | null, today: string): string {
  const lines = [emergencyResponse(kind)];
  if (records && kind !== 'self_harm') {
    const allergies = records.allergies.map(a => `${a.allergen}${a.severity ? ` (${a.severity})` : ''}`);
    const meds = records.medications
      .filter(m => m.status === 'active' && (!m.end_date || m.end_date >= today))
      .map(m => [m.name, m.strength].filter(Boolean).join(' '));
    if (allergies.length || meds.length) {
      lines.push('', 'If you speak to emergency staff, these details from your ZCare records may help:');
      if (allergies.length) lines.push(`- Allergies: ${allergies.join(', ')}`);
      if (meds.length) lines.push(`- Current medicines: ${meds.join(', ')}`);
    }
  }
  return lines.join('\n');
}

export function buildClarification(analysis: QuestionAnalysis): string {
  if (analysis.topics.includes('medication_suitability')) {
    return 'Which medicine do you mean? Please type its name — for example, "Can I take ibuprofen?" — and I will check it against the allergies and current medicines in your records.';
  }
  return 'Could you tell me a little more about what you would like to know?';
}

/** Answer text for records-only mode; the facts card carries the details. */
export function buildRecordsOnlyAnswer(context: BuiltContext): string {
  const lines: string[] = [];
  if (context.recordCount === 0 && context.facts.length === 0) {
    lines.push('I could not find records in ZCare that relate to this question.');
  } else {
    lines.push('Here is what your ZCare records show for this question (AI explanations are switched off on this device, so the details are listed as recorded).');
  }
  if (context.missing.length) {
    lines.push('', 'Missing or unavailable:', ...context.missing.map(m => `- ${m}`));
  }
  lines.push('', 'Please discuss these details with your doctor if you have concerns.');
  return lines.join('\n');
}
