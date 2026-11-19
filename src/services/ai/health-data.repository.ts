// ============================================================
// ZCare AI — read-only access to the signed-in user's records
// ============================================================
// SECURITY MODEL
// * Supabase: the user's identity is taken from the Supabase session
//   (`auth.getUser()`, validated by the auth server). A user id from the
//   UI is never used for authorisation; it is only compared against the
//   session id to detect an account switch.
// * Every query also filters by that id, but the real enforcement is the
//   database's Row Level Security: the browser can only ever read rows
//   owned by the session user.
// * Only the columns the assistant needs are selected. Nothing is logged.
// * Records are cached in memory for a short time and dropped when the
//   signed-in user changes or the conversation is cleared.

import type {
  DataSourceKind,
  DocumentLite,
  ExtractionLite,
  HealthDataSource,
  InsuranceLite,
  PatientRecords,
  ProfileLite,
  RecordCategory,
} from '../../types/ai.types.ts';
import type { Allergy, Consultation, InsurancePolicy, MedicalDocument, Medication, Profile, Reminder } from '../../types/index.ts';
import type { DocumentExtraction, LabResult } from '../../types/medicalExtraction.ts';

const CACHE_TTL_MS = 2 * 60 * 1000;

export class AssistantAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssistantAuthError';
  }
}

export function emptyRecords(source: DataSourceKind, fetched: RecordCategory[]): PatientRecords {
  return {
    source,
    fetched: [...fetched],
    profile: null,
    medications: [],
    allergies: [],
    consultations: [],
    labs: [],
    documents: [],
    extractions: [],
    reminders: [],
    insurance: [],
    errors: [],
  };
}

const CATEGORY_LABEL: Record<RecordCategory, string> = {
  profile: 'profile',
  medications: 'medications',
  allergies: 'allergies',
  consultations: 'consultations',
  labs: 'lab results',
  diagnoses: 'scanned report details',
  documents: 'documents',
  document_text: 'report text',
  reminders: 'reminders',
  insurance: 'insurance policies',
};

function failureMessage(category: RecordCategory): string {
  return `Your ${CATEGORY_LABEL[category]} could not be loaded right now.`;
}

/** Normalise an extraction row (JSON sub-fields may be null or malformed). */
function toExtractionLite(row: Record<string, unknown>): ExtractionLite {
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    id: String(row.id),
    medical_document_id: String(row.medical_document_id),
    status: row.status as ExtractionLite['status'],
    processed_at: (row.processed_at as string | null) ?? null,
    created_at: String(row.created_at ?? ''),
    report_date: typeof row.report_date === 'string' && row.report_date ? row.report_date : null,
    diagnoses: arr(row.diagnoses).filter(d => d && typeof (d as { diagnosis?: unknown }).diagnosis === 'string'),
    procedures: arr(row.procedures).filter(p => p && typeof (p as { procedure_name?: unknown }).procedure_name === 'string'),
    raw_text: typeof row.raw_text === 'string' ? row.raw_text : null,
  };
}

const USABLE_EXTRACTION = new Set(['completed', 'needs_review', 'applied']);

// ------------------------------------------------------------
// Supabase (production)
// ------------------------------------------------------------

/** The subset of the Supabase client used here (lets tests supply a fake). */
export interface SupabaseLike {
  auth: {
    getUser(): Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }>;
  };
  // The PostgREST builder is chainable and thenable; typed loosely on purpose.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any;
}

type CacheKey = RecordCategory | 'extractions' | 'extractions_text';

export class SupabaseHealthDataSource implements HealthDataSource {
  readonly kind = 'supabase' as const;
  private cache = new Map<CacheKey, { at: number; data: unknown }>();
  private cachedUserId: string | null = null;
  private readonly client: SupabaseLike;
  private readonly expectedUserId: string | null;
  private readonly now: () => number;

  constructor(client: SupabaseLike, expectedUserId: string | null, now: () => number = () => Date.now()) {
    this.client = client;
    this.expectedUserId = expectedUserId;
    this.now = now;
  }

  clearCache(): void {
    this.cache.clear();
  }

  /** Identity comes from the validated Supabase session, never from the caller. */
  private async sessionUserId(): Promise<string> {
    const { data, error } = await this.client.auth.getUser();
    const id = data?.user?.id;
    if (error || !id) {
      this.clearCache();
      throw new AssistantAuthError('Your session has expired. Please sign in again to use the assistant.');
    }
    if (this.expectedUserId && id !== this.expectedUserId) {
      this.clearCache();
      throw new AssistantAuthError('You signed in with a different account. Please reload the page.');
    }
    if (this.cachedUserId !== id) {
      this.cache.clear();
      this.cachedUserId = id;
    }
    return id;
  }

  private async cached<T>(key: CacheKey, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && this.now() - hit.at < CACHE_TTL_MS) return hit.data as T;
    const data = await load();
    this.cache.set(key, { at: this.now(), data });
    return data;
  }

  private async rows<T>(query: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (Array.isArray(data) ? data : []) as T[];
  }

  private loadDocuments(uid: string): Promise<DocumentLite[]> {
    return this.cached('documents', () =>
      this.rows<DocumentLite>(
        this.client
          .from('medical_documents')
          .select('id, title, document_type, document_date, hospital_name, description, extraction_status, consultation_id, created_at')
          .eq('user_id', uid)
          .order('created_at', { ascending: false })
          .limit(100),
      ),
    );
  }

  private loadExtractions(uid: string, withText: boolean): Promise<ExtractionLite[]> {
    const columns = [
      'id',
      'medical_document_id',
      'status',
      'processed_at',
      'created_at',
      'report_date:extracted_data->patient_info->>report_date',
      'diagnoses:extracted_data->diagnoses',
      'procedures:extracted_data->procedures',
    ];
    if (withText) columns.push('raw_text:extracted_data->>raw_text');
    return this.cached(withText ? 'extractions_text' : 'extractions', async () => {
      const rows = await this.rows<Record<string, unknown>>(
        this.client
          .from('document_extractions')
          .select(columns.join(', '))
          .eq('user_id', uid)
          .order('created_at', { ascending: false })
          .limit(withText ? 20 : 40),
      );
      return rows.map(toExtractionLite).filter(e => USABLE_EXTRACTION.has(e.status));
    });
  }

  async fetch(categories: RecordCategory[]): Promise<PatientRecords> {
    const uid = await this.sessionUserId();
    const records = emptyRecords('supabase', categories);
    const c = this.client;

    const tasks: Record<RecordCategory, () => Promise<void>> = {
      profile: async () => {
        records.profile = await this.cached('profile', async () => {
          const { data, error } = await c
            .from('profiles')
            .select('full_name, date_of_birth, gender, height, weight')
            .eq('user_id', uid)
            .maybeSingle();
          if (error) throw new Error(error.message);
          return (data as ProfileLite | null) ?? null;
        });
      },
      medications: async () => {
        records.medications = await this.cached('medications', () =>
          this.rows<Medication>(
            c.from('medications')
              .select('id, user_id, name, strength, dose, route, frequency, instructions, start_date, end_date, status, notes, source, created_at, updated_at')
              .eq('user_id', uid)
              .order('updated_at', { ascending: false })
              .limit(200),
          ),
        );
      },
      allergies: async () => {
        records.allergies = await this.cached('allergies', () =>
          this.rows<Allergy>(
            c.from('allergies')
              .select('id, user_id, allergen, reaction, severity, first_noted_at, source, verification_status, notes, created_at, updated_at')
              .eq('user_id', uid)
              .order('updated_at', { ascending: false })
              .limit(100),
          ),
        );
      },
      consultations: async () => {
        records.consultations = await this.cached('consultations', () =>
          this.rows<Consultation>(
            c.from('consultations')
              .select('id, user_id, doctor_name, specialty, hospital_name, consultation_date, reason, notes, follow_up_date, created_at, updated_at')
              .eq('user_id', uid)
              .order('consultation_date', { ascending: false })
              .limit(100),
          ),
        );
      },
      labs: async () => {
        records.labs = await this.cached('labs', () =>
          this.rows<LabResult>(
            c.from('lab_results')
              .select('id, user_id, medical_document_id, test_name, result_value, unit, reference_range, result_status, test_date, source_hospital, notes, created_at, updated_at')
              .eq('user_id', uid)
              .order('test_date', { ascending: false, nullsFirst: false })
              .limit(400),
          ),
        );
      },
      diagnoses: async () => {
        const [docs, ex] = await Promise.all([this.loadDocuments(uid), this.loadExtractions(uid, false)]);
        records.documents = records.documents.length ? records.documents : docs;
        mergeExtractions(records, ex);
      },
      documents: async () => {
        records.documents = await this.loadDocuments(uid);
      },
      document_text: async () => {
        const [docs, ex] = await Promise.all([this.loadDocuments(uid), this.loadExtractions(uid, true)]);
        records.documents = records.documents.length ? records.documents : docs;
        mergeExtractions(records, ex);
      },
      reminders: async () => {
        records.reminders = await this.cached('reminders', () =>
          this.rows<Reminder>(
            c.from('reminders')
              .select('id, user_id, title, type, due_at, timezone, recurrence_rule, status, notes, related_record_id, created_at, updated_at')
              .eq('user_id', uid)
              .order('due_at', { ascending: true })
              .limit(100),
          ),
        );
      },
      insurance: async () => {
        records.insurance = await this.cached('insurance', () =>
          this.rows<InsuranceLite>(
            c.from('insurance_policies')
              .select('id, provider, plan_name, sum_insured, valid_from, valid_until, created_at')
              .eq('user_id', uid)
              .order('created_at', { ascending: false })
              .limit(20),
          ),
        );
      },
    };

    await Promise.all(
      categories.map(async category => {
        try {
          await tasks[category]();
        } catch {
          records.errors.push({ category, message: failureMessage(category) });
        }
      }),
    );
    return records;
  }
}

/** Merge extraction rows, preferring the variant that carries report text. */
function mergeExtractions(records: PatientRecords, incoming: ExtractionLite[]): void {
  const byId = new Map(records.extractions.map(e => [e.id, e]));
  for (const e of incoming) {
    const existing = byId.get(e.id);
    if (!existing || (!existing.raw_text && e.raw_text)) byId.set(e.id, e);
  }
  records.extractions = [...byId.values()];
}

// ------------------------------------------------------------
// In-memory sources (demo account / offline local mode)
// ------------------------------------------------------------

export interface StaticRecordSet {
  profile: ProfileLite | null;
  medications: Medication[];
  allergies: Allergy[];
  consultations: Consultation[];
  labs: LabResult[];
  documents: DocumentLite[];
  extractions: ExtractionLite[];
  reminders: Reminder[];
  insurance: InsuranceLite[];
}

/** Returns a fixed record set (used for the "Explore Demo" account and tests). */
export class StaticHealthDataSource implements HealthDataSource {
  readonly kind: DataSourceKind;
  private readonly data: StaticRecordSet;

  constructor(data: StaticRecordSet, kind: DataSourceKind = 'demo') {
    this.data = data;
    this.kind = kind;
  }

  clearCache(): void {
    /* nothing cached */
  }

  async fetch(categories: RecordCategory[]): Promise<PatientRecords> {
    const r = emptyRecords(this.kind, categories);
    const has = (c: RecordCategory) => categories.includes(c);
    if (has('profile')) r.profile = this.data.profile;
    if (has('medications')) r.medications = [...this.data.medications];
    if (has('allergies')) r.allergies = [...this.data.allergies];
    if (has('consultations')) r.consultations = [...this.data.consultations];
    if (has('labs')) r.labs = [...this.data.labs];
    if (has('documents') || has('diagnoses') || has('document_text')) r.documents = [...this.data.documents];
    if (has('diagnoses') || has('document_text')) {
      r.extractions = this.data.extractions.map(e => ({ ...e, raw_text: has('document_text') ? e.raw_text : null }));
    }
    if (has('reminders')) r.reminders = [...this.data.reminders];
    if (has('insurance')) r.insurance = [...this.data.insurance];
    return r;
  }
}

export function toDocumentLite(d: MedicalDocument): DocumentLite {
  return {
    id: d.id,
    title: d.title,
    document_type: d.document_type,
    document_date: d.document_date,
    hospital_name: d.hospital_name,
    description: d.description,
    extraction_status: d.extraction_status,
    consultation_id: d.consultation_id,
    created_at: d.created_at,
  };
}

export function toInsuranceLite(p: InsurancePolicy): InsuranceLite {
  return {
    id: p.id,
    provider: p.provider,
    plan_name: p.plan_name,
    sum_insured: p.sum_insured,
    valid_from: p.valid_from,
    valid_until: p.valid_until,
    created_at: p.created_at,
  };
}

export function toProfileLite(p: Profile | null): ProfileLite | null {
  if (!p) return null;
  return { full_name: p.full_name, date_of_birth: p.date_of_birth, gender: p.gender, height: p.height, weight: p.weight };
}

export function extractionToLite(e: DocumentExtraction): ExtractionLite {
  const data = e.extracted_data;
  return {
    id: e.id,
    medical_document_id: e.medical_document_id,
    status: e.status,
    processed_at: e.processed_at,
    created_at: e.created_at,
    report_date: data?.patient_info?.report_date ?? null,
    diagnoses: data?.diagnoses ?? [],
    procedures: data?.procedures ?? [],
    raw_text: data?.raw_text ?? null,
  };
}

/** Functions from the existing api.ts used in offline local mode (Supabase not configured). */
export interface LocalApi {
  getProfile(userId: string): Promise<Profile | null>;
  getMedications(userId: string): Promise<Medication[]>;
  getAllergies(userId: string): Promise<Allergy[]>;
  getConsultations(userId: string): Promise<Consultation[]>;
  getLabResults(userId: string): Promise<LabResult[]>;
  getMedicalDocuments(userId: string): Promise<MedicalDocument[]>;
  getDocumentExtractions(userId: string): Promise<DocumentExtraction[]>;
  getReminders(userId: string): Promise<Reminder[]>;
  getInsurancePolicies(userId: string): Promise<InsurancePolicy[]>;
}

/**
 * Offline local mode only (no Supabase configured): records live in this
 * browser's localStorage and are read through the existing api.ts functions.
 */
export class LocalApiHealthDataSource implements HealthDataSource {
  readonly kind = 'local' as const;
  private readonly api: LocalApi;
  private readonly userId: string;

  constructor(api: LocalApi, userId: string) {
    this.api = api;
    this.userId = userId;
  }

  clearCache(): void {
    /* api.ts reads localStorage directly */
  }

  async fetch(categories: RecordCategory[]): Promise<PatientRecords> {
    const r = emptyRecords('local', categories);
    const u = this.userId;
    const run = async (category: RecordCategory, fn: () => Promise<void>) => {
      try {
        await fn();
      } catch {
        r.errors.push({ category, message: failureMessage(category) });
      }
    };
    const needsDocs = categories.some(c => c === 'documents' || c === 'diagnoses' || c === 'document_text');
    await Promise.all([
      categories.includes('profile') ? run('profile', async () => { r.profile = toProfileLite(await this.api.getProfile(u)); }) : null,
      categories.includes('medications') ? run('medications', async () => { r.medications = await this.api.getMedications(u); }) : null,
      categories.includes('allergies') ? run('allergies', async () => { r.allergies = await this.api.getAllergies(u); }) : null,
      categories.includes('consultations') ? run('consultations', async () => { r.consultations = await this.api.getConsultations(u); }) : null,
      categories.includes('labs') ? run('labs', async () => { r.labs = await this.api.getLabResults(u); }) : null,
      needsDocs ? run('documents', async () => { r.documents = (await this.api.getMedicalDocuments(u)).map(toDocumentLite); }) : null,
      categories.includes('diagnoses') || categories.includes('document_text')
        ? run('diagnoses', async () => {
            const withText = categories.includes('document_text');
            r.extractions = (await this.api.getDocumentExtractions(u))
              .map(extractionToLite)
              .filter(e => USABLE_EXTRACTION.has(e.status))
              .map(e => (withText ? e : { ...e, raw_text: null }));
          })
        : null,
      categories.includes('reminders') ? run('reminders', async () => { r.reminders = await this.api.getReminders(u); }) : null,
      categories.includes('insurance') ? run('insurance', async () => { r.insurance = (await this.api.getInsurancePolicies(u)).map(toInsuranceLite); }) : null,
    ]);
    return r;
  }
}
