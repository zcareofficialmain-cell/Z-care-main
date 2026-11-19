// Messages exchanged between the UI thread and the AI Web Worker.
import type { ChatPromptMessage, GenerationSettings, InferenceDevice, ModelDtype } from '../../types/ai.types.ts';

export interface LoadTimings {
  tokenizerMs: number;
  modelMs: number;
  warmupMs: number;
}

export interface ModelRef {
  modelId: string;
  dtype: ModelDtype;
  device: InferenceDevice;
}

export type WorkerRequest =
  | ({ type: 'check-cache'; id: number } & ModelRef)
  | ({ type: 'load'; id: number } & ModelRef)
  | { type: 'generate'; id: number; messages: ChatPromptMessage[]; maxNewTokens: number; settings: GenerationSettings }
  | { type: 'interrupt' }
  | { type: 'embed'; id: number; texts: string[]; modelId: string; dtype: ModelDtype }
  | { type: 'clear-cache'; id: number; models: ModelRef[] };

export type WorkerErrorStage = 'load' | 'generate' | 'embed' | 'cache';

export type WorkerResponse =
  | { type: 'progress'; id: number; loadedBytes: number; totalBytes: number }
  | { type: 'cache-status'; id: number; cached: boolean }
  | { type: 'loaded'; id: number; ms: number; timings: LoadTimings }
  | { type: 'token'; id: number; text: string }
  | { type: 'generated'; id: number; text: string; interrupted: boolean; promptTokens: number; newTokens: number; ms: number }
  | { type: 'embeddings'; id: number; vectors: Float32Array[] }
  | { type: 'cleared'; id: number }
  | { type: 'error'; id: number; stage: WorkerErrorStage; message: string };
