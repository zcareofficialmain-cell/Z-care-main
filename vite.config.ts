import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

/**
 * Transformers.js references ONNX Runtime's WASM binary, so Vite copies it
 * (~27 MB) into the build. At runtime the library loads that binary from its
 * CDN and caches it in the browser, so the copy is never used. It also exceeds
 * some static hosts' per-file limit (e.g. 25 MiB on Cloudflare Pages), so it is
 * dropped from the output.
 */
function dropUnusedOrtWasm(): Plugin {
  return {
    name: 'zcare-drop-unused-ort-wasm',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const file of Object.keys(bundle)) {
        if (/ort-wasm[^/]*\.wasm$/.test(file)) delete bundle[file];
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), dropUnusedOrtWasm()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
  build: {
    sourcemap: true,
  },
  // The AI assistant runs Transformers.js in a module Web Worker.
  worker: {
    format: 'es',
    plugins: () => [dropUnusedOrtWasm()],
  },
});
