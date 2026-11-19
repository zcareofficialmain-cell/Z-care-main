// ============================================================
// ZCare AI — record set for the "Explore Demo" account
// ============================================================
// Built only from the app's existing demo seed data. The demo has no
// scanned-report text, so each demo document's own description is used
// as its searchable text (no new medical content is invented here).

import {
  SEED_ALLERGIES,
  SEED_CONSULTATIONS,
  SEED_DOCUMENTS,
  SEED_LAB_RESULTS,
  SEED_MEDICATIONS,
  SEED_POLICIES,
  SEED_REMINDERS,
} from '../seedData.ts';
import type { ExtractionLite } from '../../types/ai.types.ts';
import { StaticHealthDataSource, toDocumentLite, toInsuranceLite, type StaticRecordSet } from './health-data.repository.ts';

/** Same values as the demo profile in AuthContext. */
const DEMO_PROFILE = {
  full_name: 'Aarav Sharma',
  date_of_birth: '1990-05-15',
  gender: 'male',
  height: 175,
  weight: 70,
};

export function demoRecordSet(): StaticRecordSet {
  const extractions: ExtractionLite[] = SEED_DOCUMENTS.filter(d => d.description).map(d => ({
    id: `demo-ext-${d.id}`,
    medical_document_id: d.id,
    status: 'applied',
    processed_at: d.created_at,
    created_at: d.created_at,
    report_date: d.document_date,
    diagnoses: [],
    procedures: [],
    raw_text: `${d.title}. ${d.description}`,
  }));

  return {
    profile: DEMO_PROFILE,
    medications: SEED_MEDICATIONS,
    allergies: SEED_ALLERGIES,
    consultations: SEED_CONSULTATIONS,
    labs: SEED_LAB_RESULTS,
    documents: SEED_DOCUMENTS.map(toDocumentLite),
    extractions,
    reminders: SEED_REMINDERS,
    insurance: SEED_POLICIES.map(toInsuranceLite),
  };
}

export function createDemoDataSource(): StaticHealthDataSource {
  return new StaticHealthDataSource(demoRecordSet(), 'demo');
}
