// ============================================================
// ZCare AI — Health Assistant engine (RAG pipeline)
// ============================================================
//   question
//     -> understanding        (intent.service)
//     -> safety pre-check     (safety.service: emergencies, flags)
//     -> retrieval            (retrieval.service via RLS-protected data source)
//     -> context preparation  (context-builder.service)
//     -> local model          (TextGenerator; runs in the browser)
//     -> safety validation    (sentence-level, while streaming + final pass)
//     -> personalised answer  (+ deterministic facts and sources)
//
// Conversation memory is in-memory only and never persisted.

import type {
  AnswerMode,
  AssistantAnswer,
  AssistantStage,
  BuiltContext,
  ContextBudget,
  ConversationTurn,
  HealthDataSource,
  PatientRecords,
  QuestionAnalysis,
  SafetyAssessment,
  TextEmbedder,
  TextGenerator,
} from '../../types/ai.types.ts';
import { analyzeQuestion } from './intent.service.ts';
import { HealthRetriever } from './retrieval.service.ts';
import { buildContext, medicationNames } from './context-builder.service.ts';
import { buildPromptMessages } from './prompt.ts';
import { SentenceStreamFilter, assessQuestionSafety, urgentNotice, validateResponse, type ValidationContext } from './safety.service.ts';
import { buildClarification, buildEmergencyAnswer, buildRecordsOnlyAnswer } from './response.service.ts';

export const MAX_QUESTION_LENGTH = 1000;

export interface EngineDeps {
  dataSource: HealthDataSource;
  generator: TextGenerator | null;
  embedder: TextEmbedder | null;
  budget: ContextBudget;
  now?: () => Date;
}

export interface AnswerCallbacks {
  onStage?: (stage: AssistantStage) => void;
  /** Deterministic facts are ready (shown before the model starts writing). */
  onFacts?: (partial: Pick<AssistantAnswer, 'keyPoints' | 'facts' | 'sources' | 'missing' | 'omitted' | 'caveats' | 'safetyLevel'>) => void;
  /** Validated answer text so far (unsafe sentences never appear here). */
  onText?: (text: string) => void;
}

function isoToday(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export class HealthAssistantEngine {
  private history: ConversationTurn[] = [];
  private readonly retriever: HealthRetriever;
  private readonly deps: EngineDeps;
  private busy = false;

  constructor(deps: EngineDeps) {
    this.deps = { ...deps };
    this.retriever = new HealthRetriever(deps.dataSource, deps.embedder);
  }

  setGenerator(generator: TextGenerator | null): void {
    this.deps.generator = generator;
  }

  setEmbedder(embedder: TextEmbedder | null): void {
    this.deps.embedder = embedder;
    this.retriever.setEmbedder(embedder);
  }

  setBudget(budget: ContextBudget): void {
    this.deps.budget = budget;
  }

  get hasGenerator(): boolean {
    return this.deps.generator !== null;
  }

  /** Clear conversation memory and any cached records/embeddings. */
  reset(): void {
    this.history = [];
    this.retriever.clear();
  }

  stop(): void {
    this.deps.generator?.interrupt();
  }

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  private answer(
    mode: AnswerMode,
    text: string,
    analysis: QuestionAnalysis,
    assessment: SafetyAssessment,
    context: BuiltContext | null,
    extra: Partial<AssistantAnswer> = {},
  ): AssistantAnswer {
    return {
      mode,
      text,
      keyPoints: context?.keyPoints ?? [],
      facts: context?.facts ?? [],
      sources: context?.sources ?? [],
      missing: context?.missing ?? [],
      omitted: context?.omitted ?? [],
      caveats: context?.caveats ?? [],
      safetyLevel: assessment.level,
      safetyNotes: assessment.level === 'urgent' ? [urgentNotice()] : [],
      analysis,
      interrupted: false,
      ...extra,
    };
  }

  private remember(question: string, answer: string, analysis: QuestionAnalysis): void {
    this.history.push({ question, answer, analysis });
    const keep = Math.max(1, this.deps.budget.historyTurns + 1);
    if (this.history.length > keep) this.history = this.history.slice(-keep);
  }

  async ask(rawQuestion: string, cb: AnswerCallbacks = {}): Promise<AssistantAnswer> {
    if (this.busy) throw new Error('The assistant is still answering the previous question.');
    const question = rawQuestion.trim().slice(0, MAX_QUESTION_LENGTH);
    if (!question) throw new Error('Please type a question.');
    this.busy = true;
    try {
      return await this.run(question, cb);
    } finally {
      this.busy = false;
    }
  }

  private async run(question: string, cb: AnswerCallbacks): Promise<AssistantAnswer> {
    const now = this.now();
    cb.onStage?.('understanding');
    const previous = this.history.length ? this.history[this.history.length - 1].analysis : null;
    const analysis = analyzeQuestion(question, previous);
    const assessment = assessQuestionSafety(question);

    // --- Emergencies: deterministic guidance, no model ---
    if (assessment.level === 'emergency' && assessment.emergencyKind) {
      let records: PatientRecords | null = null;
      try {
        records = await this.deps.dataSource.fetch(['allergies', 'medications']);
      } catch {
        records = null; // guidance is shown regardless
      }
      const text = buildEmergencyAnswer(assessment.emergencyKind, records, isoToday(now));
      cb.onText?.(text);
      this.remember(question, 'Emergency guidance was given.', analysis);
      return this.answer('emergency', text, analysis, assessment, null);
    }

    // --- Missing essential information: ask instead of guessing ---
    if (analysis.unnamedMedicine && analysis.topics.includes('medication_suitability')) {
      const text = buildClarification(analysis);
      cb.onText?.(text);
      this.remember(question, text, analysis);
      return this.answer('clarification', text, analysis, assessment, null);
    }

    // --- Retrieval + context ---
    cb.onStage?.('retrieving');
    const retrieval = await this.retriever.retrieve(analysis, { onIndexing: () => cb.onStage?.('indexing') });
    const context = buildContext({
      records: retrieval.records,
      chunks: retrieval.chunks,
      analysis,
      assessment,
      budget: this.deps.budget,
      now,
    });
    cb.onFacts?.({
      keyPoints: context.keyPoints,
      facts: context.facts,
      sources: context.sources,
      missing: context.missing,
      omitted: context.omitted,
      caveats: context.caveats,
      safetyLevel: assessment.level,
    });

    const generator = this.deps.generator;
    if (!generator) {
      const text = buildRecordsOnlyAnswer(context);
      cb.onText?.(text);
      this.remember(question, text, analysis);
      return this.answer('records-only', text, analysis, assessment, context);
    }

    // --- Local model, validated while streaming ---
    cb.onStage?.('generating');
    const vctx: ValidationContext = {
      contextText: context.contextText,
      question,
      analysis,
      assessment,
      recordCount: context.recordCount,
      medicationNames: medicationNames(retrieval.records),
    };
    const messages = buildPromptMessages({
      context,
      analysis,
      assessment,
      history: this.history,
      question,
      historyTurns: this.deps.budget.historyTurns,
    });

    const stream = new SentenceStreamFilter(vctx);
    let shown = '';
    let raw = '';
    let interrupted = false;
    try {
      const result = await generator.generate(messages, { maxNewTokens: this.deps.budget.maxNewTokens }, token => {
        raw += token;
        const approved = stream.push(token);
        if (approved) {
          shown += approved;
          cb.onText?.(shown.trim());
        }
        if (stream.degenerate) generator.interrupt();
      });
      raw = result.text || raw;
      interrupted = result.interrupted && !stream.degenerate;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The on-device model stopped unexpectedly.';
      const text = buildRecordsOnlyAnswer(context);
      cb.onText?.(text);
      return this.answer('records-only', text, analysis, assessment, context, {
        modelError: message,
        safetyNotes: ['The on-device AI model failed while answering, so only your records are shown.'],
      });
    }

    const validated = validateResponse(raw, vctx);
    let text = validated.text;
    if (interrupted) text = `${shown.trim() || text}\n\n_(Stopped.)_`;
    cb.onText?.(text);
    this.remember(question, validated.text, analysis);

    const safetyNotes = [...(assessment.level === 'urgent' ? [urgentNotice()] : []), ...validated.notes];
    return this.answer('ai', text, analysis, assessment, context, { safetyNotes, interrupted });
  }
}
