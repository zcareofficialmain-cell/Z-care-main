// ============================================================
// ZCare AI — browser capability detection
// ============================================================
// Never assumes WebGPU works: the adapter is actually requested, its
// features and limits are read, and WASM SIMD is validated. Mobile and
// memory hints only produce warnings; the real test is loading the model.

import type { DeviceCapabilities } from '../../types/ai.types.ts';

// Minimal WASM module using a SIMD instruction (feature probe).
const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

interface NavigatorExtras {
  deviceMemory?: number;
  userAgentData?: { mobile?: boolean };
  gpu?: GPU;
}

export async function detectCapabilities(): Promise<DeviceCapabilities> {
  const nav = navigator as Navigator & NavigatorExtras;
  const ua = navigator.userAgent || '';
  const isIPadOS = /Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || isIPadOS;
  const isMobile = nav.userAgentData?.mobile ?? (isIOS || /Android|Mobile/i.test(ua));

  let webgpu = false;
  let shaderF16 = false;
  let gpuDescription: string | null = null;
  let maxBufferSizeMB: number | null = null;
  if (nav.gpu) {
    try {
      const adapter = await nav.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (adapter) {
        webgpu = true;
        shaderF16 = adapter.features.has('shader-f16');
        maxBufferSizeMB = Math.round(Number(adapter.limits.maxBufferSize) / 1048576);
        const info = (adapter as GPUAdapter & { info?: GPUAdapterInfo }).info;
        if (info) gpuDescription = [info.vendor, info.architecture].filter(Boolean).join(' ') || null;
      }
    } catch {
      webgpu = false;
    }
  }

  const wasm = typeof WebAssembly === 'object';
  let wasmSimd = false;
  try {
    wasmSimd = wasm && WebAssembly.validate(SIMD_PROBE);
  } catch {
    wasmSimd = false;
  }

  let storageAvailableMB: number | null = null;
  try {
    const est = await navigator.storage?.estimate?.();
    if (est && typeof est.quota === 'number') storageAvailableMB = Math.round((est.quota - (est.usage ?? 0)) / 1048576);
  } catch {
    storageAvailableMB = null;
  }

  const deviceMemoryGB = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null;
  const warnings: string[] = [];
  if (!webgpu) {
    warnings.push(
      isIOS
        ? 'GPU acceleration (WebGPU) is not available in this browser. On iPhone and iPad it needs a recent iOS version with WebGPU enabled in Safari. The assistant can run on the processor instead, but it will be slow and may not load on older devices.'
        : 'GPU acceleration (WebGPU) is not available in this browser, so the assistant will run on the processor. Answers will be slower.',
    );
  }
  if (deviceMemoryGB !== null && deviceMemoryGB < 4) {
    warnings.push(`This device reports about ${deviceMemoryGB} GB of memory. The AI model may fail to load; records-only mode will still work.`);
  }
  if (!wasmSimd) warnings.push('This browser lacks WebAssembly SIMD support, which the AI model needs.');

  return {
    webgpu,
    shaderF16,
    gpuDescription,
    maxBufferSizeMB,
    wasm,
    wasmSimd,
    isMobile,
    isIOS,
    deviceMemoryGB,
    cores: typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : null,
    storageAvailableMB,
    crossOriginIsolated: typeof self !== 'undefined' && self.crossOriginIsolated === true,
    warnings,
  };
}
