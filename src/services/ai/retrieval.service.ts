// ============================================================
// ZCare AI — retrieval
// ============================================================
// 1. Structured records: only the categories the question needs,
//    fetched through the (RLS-protected) data source.
// 2. Report text (only when needed): split into passages and ranked by
//    BM25 keywords, blended with local embedding similarity when the
//    embedding model is available. Passage embeddings are cached for the
//    session so the history is not re-processed on every question.

import type {
  HealthDataSource,
  QuestionAnalysis,
  RetrievalResult,
  TextEmbedder,
} from '../../types/ai.types.ts';
import { buildChunks, cosineSimilarity, rankChunks } from './text-search.ts';
import { SYMPTOMS } from './medical-lexicon.ts';

const MAX_SEMANTIC_CHUNKS = 120;
const EMBED_BATCH = 16;

export interface RetrieveOptions {
  /** Called before embedding passages for the first time (can take a few seconds). */
  onIndexing?: () => void;
}

export class HealthRetriever {
  private readonly source: HealthDataSource;
  private embedder: TextEmbedder | null;
  private embeddingCache = new Map<string, Float32Array>();
  private semanticFailed = false;

  constructor(source: HealthDataSource, embedder: TextEmbedder | null) {
    this.source = source;
    this.embedder = embedder;
  }

  setEmbedder(embedder: TextEmbedder | null): void {
    this.embedder = embedder;
    this.semanticFailed = false;
  }

  /** Forget cached records and embeddings (conversation cleared / user changed). */
  clear(): void {
    this.embeddingCache.clear();
    this.source.clearCache();
  }

  async retrieve(analysis: QuestionAnalysis, opts: RetrieveOptions = {}): Promise<RetrievalResult> {
    const records = await this.source.fetch(analysis.categories);
    if (!analysis.categories.includes('document_text')) {
      return { analysis, records, chunks: [], semanticUsed: false };
    }

    const chunks = buildChunks(records.extractions, records.documents);
    if (chunks.length === 0) return { analysis, records, chunks: [], semanticUsed: false };

    let semanticScores: Array<number | null> | null = null;
    if (this.embedder && !this.semanticFailed) {
      try {
        semanticScores = await this.semanticScores(analysis, chunks.slice(0, MAX_SEMANTIC_CHUNKS).map(c => c.text), opts);
        while (semanticScores.length < chunks.length) semanticScores.push(null);
      } catch {
        // Keyword search still works; don't retry semantic search this session.
        this.semanticFailed = true;
        semanticScores = null;
      }
    }

    const ranked = rankChunks(analysis.searchTerms, chunks, {
      topK: analysis.primaryTopic === 'documents' ? 4 : 3,
      semanticScores,
    });
    return { analysis, records, chunks: ranked, semanticUsed: semanticScores !== null };
  }

  private async semanticScores(analysis: QuestionAnalysis, texts: string[], opts: RetrieveOptions): Promise<number[]> {
    const embedder = this.embedder!;
    const missing = texts.filter(t => !this.embeddingCache.has(t));
    if (missing.length > 0) {
      opts.onIndexing?.();
      for (let i = 0; i < missing.length; i += EMBED_BATCH) {
        const batch = missing.slice(i, i + EMBED_BATCH);
        const vectors = await embedder.embed(batch);
        batch.forEach((t, j) => this.embeddingCache.set(t, vectors[j]));
      }
    }
    const symptomHints = analysis.symptoms.map(k => SYMPTOMS.find(s => s.key === k)?.label ?? '').filter(Boolean);
    const query = [analysis.original, ...symptomHints].join('. ');
    const [queryVector] = await embedder.embed([query]);
    return texts.map(t => cosineSimilarity(queryVector, this.embeddingCache.get(t)!));
  }
}
