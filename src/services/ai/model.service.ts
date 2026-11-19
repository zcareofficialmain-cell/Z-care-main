// ============================================================
// ZCare AI — UI-thread client for the AI Web Worker
// ============================================================
// The worker (and the ~MB-sized AI library) is only created when the
// assistant is opened; the rest of ZCare never loads it.

import type {
  ChatPromptMessage,
  GenerateOptions,
  GenerationResult,
  GenerationSettings,
  ModelSpec,
  ModelVariant,
  TextEmbedder,
  TextGenerator,
} from '../../types/ai.types.ts';
import { EMBEDDING_MODEL } from './models.config.ts';
import type { LoadTimings, ModelRef, WorkerRequest, WorkerResponse } from './worker-protocol.ts';

type Pending = {
  resolve: (value: WorkerResponse) => void;
  reject: (err: Error) => void;
  onToken?: (text: string) => void;
  onProgress?: (loadedBytes: number, totalBytes: number) => void;
};

/** Distributes WorkerRequest over a union without losing per-variant fields. */
type RequestWithoutId = WorkerRequest extends infer R ? (R extends { id: number } ? Omit<R, 'id'> : never) : never;

export class ModelWorkerError extends Error {
  readonly stage: string;
  constructor(stage: string, message: string) {
    super(message);
    this.name = 'ModelWorkerError';
    this.stage = stage;
  }
}

export class LocalModelClient implements TextGenerator, TextEmbedder {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();
  private loaded: ModelRef | null = null;
  private settings: GenerationSettings | null = null;

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module', name: 'zcare-ai' });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => this.onMessage(event.data);
    worker.onerror = event => {
      event.preventDefault();
      this.failAll(new ModelWorkerError('worker', 'The AI engine could not start in this browser.'));
    };
    worker.onmessageerror = () => this.failAll(new ModelWorkerError('worker', 'The AI engine sent an unreadable message.'));
    this.worker = worker;
    return worker;
  }

  private onMessage(msg: WorkerResponse) {
    const p = this.pending.get(msg.id);
    if (!p) return;
    switch (msg.type) {
      case 'progress':
        p.onProgress?.(msg.loadedBytes, msg.totalBytes);
        return;
      case 'token':
        p.onToken?.(msg.text);
        return;
      case 'error':
        this.pending.delete(msg.id);
        p.reject(new ModelWorkerError(msg.stage, msg.message));
        return;
      default:
        this.pending.delete(msg.id);
        p.resolve(msg);
    }
  }

  private failAll(err: Error) {
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
    this.loaded = null;
  }

  private request(req: RequestWithoutId, hooks: Omit<Pending, 'resolve' | 'reject'> = {}): Promise<WorkerResponse> {
    const worker = this.ensureWorker();
    const id = ++this.seq;
    return new Promise<WorkerResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, ...hooks });
      worker.postMessage({ ...req, id } as WorkerRequest);
    });
  }

  get isLoaded(): boolean {
    return this.loaded !== null;
  }

  async isCached(modelId: string, variant: ModelVariant): Promise<boolean> {
    const res = await this.request({ type: 'check-cache', modelId, dtype: variant.dtype, device: variant.device });
    return res.type === 'cache-status' && res.cached;
  }

  async load(
    model: ModelSpec,
    variant: ModelVariant,
    onProgress?: (loadedBytes: number, totalBytes: number) => void,
  ): Promise<{ ms: number; timings: LoadTimings | null }> {
    const ref: ModelRef = { modelId: model.id, dtype: variant.dtype, device: variant.device };
    const res = await this.request({ type: 'load', ...ref }, { onProgress });
    this.loaded = ref;
    this.settings = model.generation;
    return res.type === 'loaded' ? { ms: res.ms, timings: res.timings } : { ms: 0, timings: null };
  }

  async generate(messages: ChatPromptMessage[], options: GenerateOptions, onToken: (token: string) => void): Promise<GenerationResult> {
    if (!this.loaded || !this.settings) throw new ModelWorkerError('generate', 'The AI model is not loaded.');
    const res = await this.request({ type: 'generate', messages, maxNewTokens: options.maxNewTokens, settings: this.settings }, { onToken });
    if (res.type !== 'generated') throw new ModelWorkerError('generate', 'Unexpected response from the AI engine.');
    return { text: res.text, interrupted: res.interrupted };
  }

  interrupt(): void {
    this.worker?.postMessage({ type: 'interrupt' } satisfies WorkerRequest);
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    const res = await this.request({ type: 'embed', texts, modelId: EMBEDDING_MODEL.id, dtype: EMBEDDING_MODEL.dtype });
    if (res.type !== 'embeddings') throw new ModelWorkerError('embed', 'Unexpected response from the AI engine.');
    return res.vectors;
  }

  /** Delete downloaded model files from the browser cache. */
  async clearCache(models: ModelRef[]): Promise<void> {
    await this.request({ type: 'clear-cache', models });
    if (this.loaded && models.some(m => m.modelId === this.loaded!.modelId && m.dtype === this.loaded!.dtype)) this.loaded = null;
  }

  /** Stop the worker and free its memory (e.g. on sign-out or after a fatal error). */
  terminate(): void {
    this.failAll(new ModelWorkerError('worker', 'The AI engine was stopped.'));
  }
}

/** One engine per browser tab. */
export const localModel = new LocalModelClient();
