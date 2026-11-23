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

/**
 * Local dev server middleware for /api routes (Razorpay order creation & payment verification)
 */
function devApiPlugin(): Plugin {
  return {
    name: 'zcare-dev-api-middleware',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const url = req.url?.split('?')[0];
        if (url === '/api/create-order' || url === '/api/verify-payment') {
          if (!res.status) {
            res.status = function (code: number) { this.statusCode = code; return this; };
          }
          if (!res.json) {
            res.json = function (obj: any) {
              this.setHeader('Content-Type', 'application/json');
              this.end(JSON.stringify(obj));
              return this;
            };
          }
          let bodyData = '';
          req.on('data', (chunk: any) => { bodyData += chunk; });
          req.on('end', async () => {
            try {
              req.body = bodyData ? JSON.parse(bodyData) : {};
              if (url === '/api/create-order') {
                const handler = (await import('./api/create-order.js')).default;
                await handler(req, res);
              } else if (url === '/api/verify-payment') {
                const handler = (await import('./api/verify-payment.js')).default;
                await handler(req, res);
              }
            } catch (err: any) {
              res.status(500).json({ error: err.message || 'Internal server error' });
            }
          });
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), dropUnusedOrtWasm(), devApiPlugin()],
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
