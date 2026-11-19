// ============================================================
// ZCare AI — on-device model configuration
// ============================================================
// Model choice was made from measured results (Nov 2026):
//   * Qwen2.5-0.5B: q4f16 output broke down on WebGPU (fp16 overflow), and
//     on CPU it contradicted allergy alerts and invented results — rejected.
//   * Qwen3-1.7B / Qwen2.5-1.5B: single-file q4f16 weights (1.2–1.4 GB) fail
//     to load in the browser runtime ("std::bad_alloc") — rejected.
//   * Qwen3-0.6B: correct, grounded output on WebGPU (q4f16) at ~25 tokens/s,
//     ~4 s to load from cache — selected.
// Weights are downloaded once from the Hugging Face CDN and cached by the
// browser (Cache API, "transformers-cache"); later visits load from the cache.

import type { ContextBudget, DeviceCapabilities, ModelSpec, ModelVariant, RuntimeChoice } from '../../types/ai.types.ts';

export const STANDARD_MODEL: ModelSpec = {
  key: 'standard',
  id: 'onnx-community/Qwen3-0.6B-ONNX',
  name: 'Qwen3 0.6B',
  license: 'Apache-2.0',
  licenseUrl: 'https://huggingface.co/Qwen/Qwen3-0.6B',
  description: 'Small open model (Alibaba Qwen team) that runs inside the browser.',
  desktopOnly: false,
  // Qwen3 non-thinking mode with the decoding settings its authors recommend (greedy decoding is discouraged).
  generation: {
    doSample: true,
    temperature: 0.7,
    topP: 0.8,
    topK: 20,
    repetitionPenalty: 1.05,
    chatTemplateKwargs: { enable_thinking: false },
  },
  variants: {
    webgpuF16: { device: 'webgpu', dtype: 'q4f16', sizeMB: 543 },
    webgpu: { device: 'webgpu', dtype: 'q4', sizeMB: 877 },
    wasm: { device: 'wasm', dtype: 'q8', sizeMB: 589 },
  },
};

/** Sentence-embedding model for semantic search over report text (runs on the CPU). */
export const EMBEDDING_MODEL = {
  id: 'Xenova/all-MiniLM-L6-v2',
  name: 'all-MiniLM-L6-v2',
  license: 'Apache-2.0',
  device: 'wasm' as const,
  dtype: 'q8' as const,
  sizeMB: 22,
};

/**
 * One-time extras downloaded with the model: tokenizer/config files (~11 MB)
 * and the ONNX Runtime WebAssembly engine (~27 MB uncompressed, served compressed).
 */
export const RUNTIME_OVERHEAD_MB = 38;

/** Approximate first-time download (worst case, before HTTP compression). */
export function downloadSizeMB(variant: ModelVariant): number {
  return variant.sizeMB + RUNTIME_OVERHEAD_MB + EMBEDDING_MODEL.sizeMB;
}

export interface RuntimePreference {
  /** Force CPU (WASM) even when WebGPU exists — the compatibility fallback. */
  forceCpu: boolean;
}

/** Picks the model variant for this device, or null if nothing can run here. */
export function chooseRuntime(caps: DeviceCapabilities, pref: RuntimePreference): RuntimeChoice | null {
  const cpu = (): RuntimeChoice | null =>
    caps.wasm && caps.wasmSimd ? { model: STANDARD_MODEL, variant: STANDARD_MODEL.variants.wasm! } : null;

  if (pref.forceCpu || !caps.webgpu) return cpu();
  // Very small GPU buffer limits cannot hold the model's weight tensors.
  if (caps.maxBufferSizeMB !== null && caps.maxBufferSizeMB < 128) return cpu();
  if (caps.shaderF16) return { model: STANDARD_MODEL, variant: STANDARD_MODEL.variants.webgpuF16! };
  // GPUs without 16-bit float support need the larger fp32 variant; phones use the CPU build instead.
  if (caps.isMobile) return cpu();
  return { model: STANDARD_MODEL, variant: STANDARD_MODEL.variants.webgpu! };
}

/** How much record text and generation the device can handle comfortably. */
export function budgetFor(choice: RuntimeChoice | null): ContextBudget {
  if (!choice) return { maxContextChars: 8000, maxNewTokens: 0, historyTurns: 0 };
  if (choice.variant.device === 'wasm') return { maxContextChars: 2600, maxNewTokens: 220, historyTurns: 1 };
  return { maxContextChars: 4200, maxNewTokens: 300, historyTurns: 2 };
}
