// ============================================================
// ZCare AI — Web Worker running the on-device models
// ============================================================
// Runs Transformers.js (ONNX Runtime Web) off the UI thread:
//   * WebGPU when available, otherwise WebAssembly on the CPU.
//   * Model files come from the Hugging Face CDN once and are cached in
//     the browser's Cache API; ONNX Runtime's WASM binary is cached too.
//   * Patient data only exists here transiently while a prompt is being
//     processed. Nothing is logged, stored or sent anywhere.

import {
  AutoModelForCausalLM,
  AutoTokenizer,
  InterruptableStoppingCriteria,
  LogLevel,
  ModelRegistry,
  TextStreamer,
  env,
  pipeline,
  type FeatureExtractionPipeline,
  type PreTrainedModel,
  type PreTrainedTokenizer,
  type ProgressInfo,
  type Tensor,
} from '@huggingface/transformers';
import type { WorkerRequest, WorkerResponse } from './worker-protocol.ts';

env.allowLocalModels = false;
env.useBrowserCache = true;
env.logLevel = LogLevel.ERROR;

/** The parts of the dedicated-worker global scope used here (avoids mixing DOM and WebWorker lib types). */
interface WorkerScope {
  postMessage(message: WorkerResponse, transfer: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<WorkerRequest>) => void): void;
}
const ctx = self as unknown as WorkerScope;
const post = (msg: WorkerResponse, transfer: Transferable[] = []) => ctx.postMessage(msg, transfer);

let tokenizer: PreTrainedTokenizer | null = null;
let model: PreTrainedModel | null = null;
let loadedKey: string | null = null;
let extractor: FeatureExtractionPipeline | null = null;
let extractorKey: string | null = null;
const stopping = new InterruptableStoppingCriteria();

function errorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  // Keep messages short; they never contain patient data (only runtime details).
  return raw.length > 300 ? `${raw.slice(0, 300)}…` : raw;
}

/** Aggregates per-file download progress into one byte count for the whole load. */
function progressReporter(id: number) {
  const files = new Map<string, { loaded: number; total: number }>();
  return (info: ProgressInfo) => {
    if (info.status !== 'progress') return;
    const p = info as { file?: string; name?: string; loaded?: number; total?: number };
    files.set(`${p.name ?? ''}/${p.file ?? ''}`, { loaded: p.loaded ?? 0, total: p.total ?? 0 });
    let loadedBytes = 0;
    let totalBytes = 0;
    for (const f of files.values()) {
      loadedBytes += f.loaded;
      totalBytes += f.total;
    }
    post({ type: 'progress', id, loadedBytes, totalBytes });
  };
}

async function disposeModel() {
  try {
    await model?.dispose();
  } catch {
    /* ignore */
  }
  model = null;
  tokenizer = null;
  loadedKey = null;
}

async function handle(req: WorkerRequest) {
  switch (req.type) {
    case 'check-cache': {
      try {
        const cached = await ModelRegistry.is_cached(req.modelId, { dtype: req.dtype, device: req.device });
        post({ type: 'cache-status', id: req.id, cached });
      } catch {
        post({ type: 'cache-status', id: req.id, cached: false });
      }
      return;
    }

    case 'load': {
      const key = `${req.modelId}|${req.dtype}|${req.device}`;
      if (loadedKey === key && model && tokenizer) {
        post({ type: 'loaded', id: req.id, ms: 0, timings: { tokenizerMs: 0, modelMs: 0, warmupMs: 0 } });
        return;
      }
      const started = performance.now();
      try {
        await disposeModel();
        const onProgress = progressReporter(req.id);
        tokenizer = await AutoTokenizer.from_pretrained(req.modelId, { progress_callback: onProgress });
        const tokenizerDone = performance.now();
        model = await AutoModelForCausalLM.from_pretrained(req.modelId, {
          dtype: req.dtype,
          device: req.device,
          progress_callback: onProgress,
        });
        const modelDone = performance.now();
        // Warm-up: compiles GPU shaders / initialises kernels before the first real question.
        const warm = tokenizer('Hello', { return_tensor: true }) as Record<string, Tensor>;
        await model.generate({ ...warm, max_new_tokens: 1, do_sample: false });
        const done = performance.now();
        loadedKey = key;
        post({
          type: 'loaded',
          id: req.id,
          ms: Math.round(done - started),
          timings: {
            tokenizerMs: Math.round(tokenizerDone - started),
            modelMs: Math.round(modelDone - tokenizerDone),
            warmupMs: Math.round(done - modelDone),
          },
        });
      } catch (err) {
        await disposeModel();
        post({ type: 'error', id: req.id, stage: 'load', message: errorMessage(err) });
      }
      return;
    }

    case 'generate': {
      if (!model || !tokenizer) {
        post({ type: 'error', id: req.id, stage: 'generate', message: 'The AI model is not loaded.' });
        return;
      }
      const started = performance.now();
      try {
        stopping.reset();
        const s = req.settings;
        // Extra template variables (e.g. enable_thinking=false for Qwen3) are forwarded to the chat template.
        const templateOptions = { add_generation_prompt: true, return_dict: true, ...(s.chatTemplateKwargs ?? {}) };
        const inputs = tokenizer.apply_chat_template(req.messages, templateOptions as { add_generation_prompt: true; return_dict: true }) as Record<string, Tensor>;
        let text = '';
        const streamer = new TextStreamer(tokenizer, {
          skip_prompt: true,
          skip_special_tokens: true,
          callback_function: (piece: string) => {
            text += piece;
            post({ type: 'token', id: req.id, text: piece });
          },
        });
        const output = (await model.generate({
          ...inputs,
          max_new_tokens: req.maxNewTokens,
          do_sample: s.doSample,
          ...(s.doSample ? { temperature: s.temperature, top_p: s.topP, top_k: s.topK } : {}),
          ...(s.repetitionPenalty ? { repetition_penalty: s.repetitionPenalty } : {}),
          streamer,
          stopping_criteria: stopping,
        })) as Tensor;
        const promptTokens = inputs.input_ids.dims[1];
        const newTokens = Math.max(0, output.dims[1] - promptTokens);
        post({
          type: 'generated',
          id: req.id,
          text,
          interrupted: stopping.interrupted,
          promptTokens,
          newTokens,
          ms: Math.round(performance.now() - started),
        });
      } catch (err) {
        post({ type: 'error', id: req.id, stage: 'generate', message: errorMessage(err) });
      }
      return;
    }

    case 'interrupt': {
      stopping.interrupt();
      return;
    }

    case 'embed': {
      try {
        const key = `${req.modelId}|${req.dtype}`;
        if (!extractor || extractorKey !== key) {
          extractor = (await pipeline('feature-extraction', req.modelId, { device: 'wasm', dtype: req.dtype })) as FeatureExtractionPipeline;
          extractorKey = key;
        }
        const out = (await extractor(req.texts, { pooling: 'mean', normalize: true })) as Tensor;
        const [n, dim] = out.dims;
        const data = out.data as Float32Array;
        const vectors: Float32Array[] = [];
        for (let i = 0; i < n; i++) vectors.push(data.slice(i * dim, (i + 1) * dim));
        post({ type: 'embeddings', id: req.id, vectors }, vectors.map(v => v.buffer));
      } catch (err) {
        post({ type: 'error', id: req.id, stage: 'embed', message: errorMessage(err) });
      }
      return;
    }

    case 'clear-cache': {
      try {
        if (req.models.some(m => `${m.modelId}|${m.dtype}|${m.device}` === loadedKey)) await disposeModel();
        for (const m of req.models) await ModelRegistry.clear_cache(m.modelId, { dtype: m.dtype, device: m.device });
        post({ type: 'cleared', id: req.id });
      } catch (err) {
        post({ type: 'error', id: req.id, stage: 'cache', message: errorMessage(err) });
      }
      return;
    }
  }
}

// Requests are processed one at a time, except "interrupt" which must act immediately.
let queue: Promise<void> = Promise.resolve();
ctx.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  if (req.type === 'interrupt') {
    stopping.interrupt();
    return;
  }
  queue = queue.then(() => handle(req));
});
