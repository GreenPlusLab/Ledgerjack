import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// Text recognition (OCR) runs on the phone. Its files are served from LedgerJack
// itself under /ocr/ so nothing is fetched from another website: the reader's
// worker, the LSTM builds of its engine (the browser picks one), and the English
// language file. See src/lib/ocr/ocr.ts.
const require = createRequire(import.meta.url);
function pkgDir(name: string): string {
  try { return dirname(require.resolve(`${name}/package.json`)); }
  catch { return join(process.cwd(), 'node_modules', name); }
}
function ocrFiles(): Record<string, string> {
  const tjs = pkgDir('tesseract.js');
  const core = pkgDir('tesseract.js-core');
  const lang = pkgDir('@tesseract.js-data/eng');
  const files: Record<string, string> = {
    'ocr/worker.min.js': join(tjs, 'dist/worker.min.js'),
    'ocr/lang/eng.traineddata.gz': join(lang, '4.0.0_best_int/eng.traineddata.gz'),
  };
  for (const v of ['tesseract-core-lstm', 'tesseract-core-simd-lstm', 'tesseract-core-relaxedsimd-lstm']) {
    files[`ocr/core/${v}.wasm.js`] = join(core, `${v}.wasm.js`);
  }
  return files;
}

function ocrAssets(): Plugin {
  return {
    name: 'ledgerjack-ocr-assets',
    configureServer(server) {
      const files = ocrFiles();
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0]!.replace(/^\//, '');
        const src = files[path];
        if (!src || !existsSync(src)) return next();
        res.setHeader('Content-Type', path.endsWith('.gz') ? 'application/octet-stream' : 'text/javascript');
        res.end(readFileSync(src));
      });
    },
    generateBundle() {
      for (const [fileName, src] of Object.entries(ocrFiles())) {
        this.emitFile({ type: 'asset', fileName, source: readFileSync(src) });
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    ocrAssets(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['vite.svg'],
      manifest: {
        name: 'LedgerJack',
        short_name: 'LedgerJack',
        description: 'Encrypted double-entry pre-accounting for tradespeople and gig workers',
        theme_color: '#ffffff',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
        // The text-recognition files are large and optional: not precached, but
        // kept after the first use so reading works offline from then on.
        globIgnores: ['ocr/**'],
        runtimeCaching: [
          {
            urlPattern: ({ url }: { url: URL }) => url.pathname.includes('/ocr/'),
            handler: 'CacheFirst',
            options: { cacheName: 'ledgerjack-ocr', expiration: { maxEntries: 10 } },
          },
          {
            urlPattern: /^https:\/\/api\.openai\.com\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
