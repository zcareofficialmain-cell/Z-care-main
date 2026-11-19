// ============================================================
// ZCare AI — keyword + semantic search over report text
// ============================================================
// Structured values (lab results, dates, medicines) are always fetched
// with SQL. This module only ranks *unstructured* text: the extracted
// text of scanned reports. Keyword scoring is BM25; when the local
// embedding model is available, cosine similarity is blended in.

import type { ExtractionLite, DocumentLite, RankedChunk, TextChunk } from '../../types/ai.types.ts';
import { tokenize } from './intent.service.ts';

export const MAX_CHUNK_CHARS = 520;
const MAX_CHUNKS_PER_DOCUMENT = 40;
const MAX_DOCUMENTS = 15;

/** Split a report's text into overlapping passages of roughly MAX_CHUNK_CHARS. */
export function chunkText(text: string, maxChars = MAX_CHUNK_CHARS): string[] {
  const clean = text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
  if (!clean) return [];
  // (No regex lookbehind: unsupported before Safari 16.4.)
  const sentences = clean
    .replace(/([.!?])\s+/g, '$1\n')
    .split(/\n+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  const chunks: string[] = [];
  let current: string[] = [];
  let length = 0;
  for (const sentence of sentences) {
    const piece = sentence.length > maxChars ? sentence.slice(0, maxChars) : sentence;
    if (length + piece.length + 1 > maxChars && current.length > 0) {
      chunks.push(current.join(' '));
      // one-sentence overlap keeps context across boundaries
      const last = current[current.length - 1];
      current = last.length < maxChars / 3 ? [last] : [];
      length = current.reduce((n, s) => n + s.length + 1, 0);
    }
    current.push(piece);
    length += piece.length + 1;
  }
  if (current.length > 0) chunks.push(current.join(' '));
  return chunks.filter(c => c.replace(/[^a-z0-9]/gi, '').length >= 20);
}

/** Build searchable passages from the most recent extracted reports. */
export function buildChunks(extractions: ExtractionLite[], documents: DocumentLite[]): TextChunk[] {
  const byId = new Map(documents.map(d => [d.id, d]));
  const sorted = [...extractions]
    .filter(e => e.raw_text && e.raw_text.trim().length > 0)
    .sort((a, b) => (b.report_date ?? b.created_at).localeCompare(a.report_date ?? a.created_at))
    .slice(0, MAX_DOCUMENTS);

  const seenDocs = new Set<string>();
  const chunks: TextChunk[] = [];
  for (const ex of sorted) {
    // Re-scans of the same document: keep only the newest extraction.
    if (seenDocs.has(ex.medical_document_id)) continue;
    seenDocs.add(ex.medical_document_id);
    const doc = byId.get(ex.medical_document_id);
    const passages = chunkText(ex.raw_text ?? '').slice(0, MAX_CHUNKS_PER_DOCUMENT);
    passages.forEach((text, i) => {
      chunks.push({
        id: `${ex.id}#${i}`,
        documentId: ex.medical_document_id,
        documentTitle: doc?.title ?? 'Scanned report',
        documentDate: doc?.document_date ?? ex.report_date ?? null,
        text,
      });
    });
  }
  return chunks;
}

/** Okapi BM25 scores for each document (same order as `docs`). */
export function bm25Scores(queryTerms: string[], docs: string[][], k1 = 1.2, b = 0.75): number[] {
  const n = docs.length;
  if (n === 0 || queryTerms.length === 0) return docs.map(() => 0);
  const avgLen = docs.reduce((s, d) => s + d.length, 0) / n || 1;
  const terms = [...new Set(queryTerms)];
  const df = new Map<string, number>();
  for (const t of terms) df.set(t, docs.reduce((c, d) => c + (d.includes(t) ? 1 : 0), 0));

  return docs.map(doc => {
    const tf = new Map<string, number>();
    for (const tok of doc) tf.set(tok, (tf.get(tok) ?? 0) + 1);
    let score = 0;
    for (const t of terms) {
      const f = tf.get(t) ?? 0;
      if (f === 0) continue;
      const d = df.get(t) ?? 0;
      const idf = Math.log(1 + (n - d + 0.5) / (d + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * doc.length) / avgLen)));
    }
    return score;
  });
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface RankOptions {
  topK?: number;
  /** Cosine similarity per chunk (same order as chunks), or null when semantic search is unavailable. */
  semanticScores?: Array<number | null> | null;
  minSemantic?: number;
}

/** Rank chunks with BM25 and (optionally) semantic similarity. Returns only relevant chunks. */
export function rankChunks(searchTerms: string[], chunks: TextChunk[], opts: RankOptions = {}): RankedChunk[] {
  const topK = opts.topK ?? 4;
  const minSemantic = opts.minSemantic ?? 0.35;
  const keyword = bm25Scores(searchTerms, chunks.map(c => tokenize(c.text)));
  const maxKeyword = Math.max(0, ...keyword);
  const semantic = opts.semanticScores ?? null;

  const ranked: RankedChunk[] = chunks.map((c, i) => {
    const kw = maxKeyword > 0 ? keyword[i] / maxKeyword : 0;
    const sem = semantic ? semantic[i] ?? null : null;
    const score = sem === null ? kw : 0.45 * kw + 0.55 * Math.max(0, sem);
    return { ...c, keywordScore: keyword[i], semanticScore: sem, score };
  });

  return ranked
    .filter(r => r.keywordScore > 0 || (r.semanticScore !== null && r.semanticScore >= minSemantic))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
