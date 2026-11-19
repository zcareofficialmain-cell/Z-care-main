// ============================================================
// ZCare AI Health Assistant — shared types
// ============================================================
// Type-only module (safe to import from Node tests: erased at runtime).

import type {
  Allergy,
  Consultation,
  InsurancePolicy,
  MedicalDocument,
  Medication,
  Profile,
  Reminder,
} from './index.ts';
import type {
  DocumentExtractionStatus,
  ExtractedDiagnosis,
  ExtractedProcedure,
  LabResult,
} from './medicalExtraction.ts';

// ------------------------------------------------------------
// Question understanding
// ------------------------------------------------------------
export type HealthTopic =
  | 'symptoms'
  | 'conditions'
  | 'medications'
  | 'medication_suitability'
  | 'allergies'
  | 'labs'
  | 'lab_trends'
  | 'consultations'
  | 'documents'
  | 'reminders'
  | 'appointment_prep'
  | 'insurance'
  | 'profile'
  | 'summary'
  | 'general';

/** Groups of records the retriever can fetch. */
export type RecordCategory =
  | 'profile'
  | 'medications'
  | 'allergies'
  | 'consultations'
  | 'labs'
  | 'diagnoses'
  | 'documents'
  | 'document_text'
  | 'reminders'
  | 'insurance';

export interface QuestionAnalysis {
  original: string;
  normalized: string;
  topics: HealthTopic[];
  primaryTopic: HealthTopic;
  categories: RecordCategory[];
  /** Medicine names mentioned in the question (lower-case, canonical). */
  mentionedDrugs: string[];
  /** Lab families relevant to the question, e.g. "glucose", "lipids". */
  labFamilies: string[];
  /** Symptom keys found in the question, e.g. "fatigue". */
  symptoms: string[];
  /** Expanded keyword list used for text search. */
  searchTerms: string[];
  wantsHistory: boolean;
  /** Question refers to a medicine without naming it ("this medicine"). */
  unnamedMedicine: boolean;
  isFollowUp: boolean;
  /** Question text used to find the visit/doctor referred to (includes earlier turns for follow-ups). */
  referenceText?: string;
}

// ------------------------------------------------------------
// Safety
// ------------------------------------------------------------
export type SafetyLevel = 'none' | 'urgent' | 'emergency';

export type EmergencyKind =
  | 'cardiac'
  | 'breathing'
  | 'stroke'
  | 'anaphylaxis'
  | 'self_harm'
  | 'overdose'
  | 'bleeding'
  | 'seizure'
  | 'unconscious'
  | 'glucose';

export type QuestionSafetyFlag =
  | 'medication_change'
  | 'diagnosis_request'
  | 'prescription_request'
  | 'dosage_question'
  | 'interaction_question';

export interface SafetyAssessment {
  level: SafetyLevel;
  emergencyKind?: EmergencyKind;
  flags: QuestionSafetyFlag[];
}

export interface ResponseValidation {
  text: string;
  removedSentences: number;
  notes: string[];
  usedFallback: boolean;
}

// ------------------------------------------------------------
// Retrieved records
// ------------------------------------------------------------
export type ProfileLite = Pick<
  Profile,
  'full_name' | 'date_of_birth' | 'gender' | 'height' | 'weight'
>;

export type DocumentLite = Pick<
  MedicalDocument,
  | 'id'
  | 'title'
  | 'document_type'
  | 'document_date'
  | 'hospital_name'
  | 'description'
  | 'extraction_status'
  | 'consultation_id'
  | 'created_at'
>;

export interface ExtractionLite {
  id: string;
  medical_document_id: string;
  status: DocumentExtractionStatus;
  processed_at: string | null;
  created_at: string;
  report_date: string | null;
  diagnoses: ExtractedDiagnosis[];
  procedures: ExtractedProcedure[];
  /** Full report text. Only fetched when the question needs document text. */
  raw_text: string | null;
}

export type InsuranceLite = Pick<
  InsurancePolicy,
  'id' | 'provider' | 'plan_name' | 'sum_insured' | 'valid_from' | 'valid_until' | 'created_at'
>;

export type DataSourceKind = 'supabase' | 'demo' | 'local';

export interface PatientRecords {
  source: DataSourceKind;
  /** Categories actually requested from the data source. */
  fetched: RecordCategory[];
  profile: ProfileLite | null;
  medications: Medication[];
  allergies: Allergy[];
  consultations: Consultation[];
  labs: LabResult[];
  documents: DocumentLite[];
  extractions: ExtractionLite[];
  reminders: Reminder[];
  insurance: InsuranceLite[];
  /** Categories that failed to load (message is safe to show; no record content). */
  errors: { category: RecordCategory; message: string }[];
}

/** Read-only access to the signed-in user's records. */
export interface HealthDataSource {
  readonly kind: DataSourceKind;
  fetch(categories: RecordCategory[]): Promise<PatientRecords>;
  /** Forget any cached records (e.g. when the conversation is cleared). */
  clearCache(): void;
}

// ------------------------------------------------------------
// Text retrieval
// ------------------------------------------------------------
export interface TextChunk {
  id: string;
  documentId: string;
  documentTitle: string;
  documentDate: string | null;
  text: string;
}

export interface RankedChunk extends TextChunk {
  score: number;
  keywordScore: number;
  semanticScore: number | null;
}

export interface RetrievalResult {
  analysis: QuestionAnalysis;
  records: PatientRecords;
  chunks: RankedChunk[];
  semanticUsed: boolean;
}

// ------------------------------------------------------------
// Context for the model and for the UI
// ------------------------------------------------------------
export type SourceKind =
  | 'profile'
  | 'medication'
  | 'allergy'
  | 'lab'
  | 'consultation'
  | 'diagnosis'
  | 'procedure'
  | 'document'
  | 'reminder'
  | 'insurance';

export interface SourceRef {
  kind: SourceKind;
  id: string;
  label: string;
  date: string | null;
  href: string;
}

export type FactTone = 'normal' | 'warning' | 'danger' | 'muted';

export interface FactItem {
  text: string;
  tone: FactTone;
}

export interface FactSection {
  title: string;
  items: FactItem[];
}

export interface BuiltContext {
  /** Plain-text record summary given to the language model. */
  contextText: string;
  /** The few most relevant facts, shown first in the answer (deterministic, never model-written). */
  keyPoints: FactItem[];
  /** Same facts, structured for display. */
  facts: FactSection[];
  sources: SourceRef[];
  /** Information that is missing for this question. */
  missing: string[];
  /** Records left out because of the size budget (never silent). */
  omitted: string[];
  /** Data-quality notes: conflicts, outdated entries, merged duplicates. */
  caveats: string[];
  recordCount: number;
  estimatedTokens: number;
}

export interface ContextBudget {
  /** Maximum characters of record text sent to the model. */
  maxContextChars: number;
  maxNewTokens: number;
  /** Maximum number of earlier exchanges kept for follow-ups. */
  historyTurns: number;
}

// ------------------------------------------------------------
// Model / runtime
// ------------------------------------------------------------
export type InferenceDevice = 'webgpu' | 'wasm';
export type ModelDtype = 'q4f16' | 'q4' | 'q8';

export interface ModelVariant {
  device: InferenceDevice;
  dtype: ModelDtype;
  /** Approximate download size of the model weights in MB. */
  sizeMB: number;
}

/** Decoding settings for a model (recommended values differ between model families). */
export interface GenerationSettings {
  doSample: boolean;
  temperature?: number;
  topP?: number;
  topK?: number;
  repetitionPenalty?: number;
  /** Extra variables for the chat template, e.g. { enable_thinking: false } for Qwen3. */
  chatTemplateKwargs?: Record<string, boolean | string | number>;
}

export interface ModelSpec {
  key: 'standard' | 'enhanced';
  id: string;
  name: string;
  license: string;
  licenseUrl: string;
  description: string;
  desktopOnly: boolean;
  generation: GenerationSettings;
  variants: {
    webgpuF16?: ModelVariant;
    webgpu?: ModelVariant;
    wasm?: ModelVariant;
  };
}

export interface DeviceCapabilities {
  webgpu: boolean;
  shaderF16: boolean;
  gpuDescription: string | null;
  maxBufferSizeMB: number | null;
  wasm: boolean;
  wasmSimd: boolean;
  isMobile: boolean;
  isIOS: boolean;
  deviceMemoryGB: number | null;
  cores: number | null;
  storageAvailableMB: number | null;
  crossOriginIsolated: boolean;
  warnings: string[];
}

export interface RuntimeChoice {
  model: ModelSpec;
  variant: ModelVariant;
}

export type ModelPhase =
  | 'detecting'
  | 'needs-consent'
  | 'checking-cache'
  | 'downloading'
  | 'initializing'
  | 'ready'
  | 'error'
  | 'unsupported'
  | 'records-only';

export interface DownloadProgress {
  loadedMB: number;
  totalMB: number;
  percent: number;
}

export interface ChatPromptMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerateOptions {
  maxNewTokens: number;
}

export interface GenerationResult {
  text: string;
  interrupted: boolean;
}

/** Anything that can produce text from chat messages (local model, or a test double). */
export interface TextGenerator {
  generate(
    messages: ChatPromptMessage[],
    options: GenerateOptions,
    onToken: (token: string) => void,
  ): Promise<GenerationResult>;
  interrupt(): void;
}

/** Anything that can embed text (local embedding model, or a test double). */
export interface TextEmbedder {
  embed(texts: string[]): Promise<Float32Array[]>;
}

// ------------------------------------------------------------
// Conversation
// ------------------------------------------------------------
export type AnswerMode = 'ai' | 'records-only' | 'emergency' | 'clarification';

export interface ConversationTurn {
  question: string;
  answer: string;
  analysis: QuestionAnalysis;
}

export interface AssistantAnswer {
  mode: AnswerMode;
  text: string;
  keyPoints: FactItem[];
  facts: FactSection[];
  sources: SourceRef[];
  missing: string[];
  omitted: string[];
  caveats: string[];
  safetyLevel: SafetyLevel;
  safetyNotes: string[];
  analysis: QuestionAnalysis;
  interrupted: boolean;
  /** Set when the local model failed while answering (answer fell back to records only). */
  modelError?: string;
}

export type AssistantStage = 'understanding' | 'retrieving' | 'indexing' | 'generating';

export interface ChatMessageView {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: number;
  pending?: boolean;
  stage?: AssistantStage;
  /** Deterministic facts available before the model finishes writing. */
  preview?: Pick<AssistantAnswer, 'keyPoints' | 'facts' | 'sources' | 'missing' | 'omitted' | 'caveats' | 'safetyLevel'>;
  answer?: AssistantAnswer;
  error?: string;
}
