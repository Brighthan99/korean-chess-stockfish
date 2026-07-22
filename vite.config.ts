import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// The engine WASM (pthread) needs SharedArrayBuffer, so dev/preview also
// send the same COOP/COEP headers as the production server. (plan §3.4)
const crossOriginIsolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [svelte()],
  server: { headers: crossOriginIsolation },
  preview: { headers: crossOriginIsolation },
  // ffish-es6 is an emscripten artifact, so exclude it from pre-bundling;
  // the wasm is loaded from public/ffish/ via locateFile (scripts/copy-wasm.mjs).
  optimizeDeps: { exclude: ['ffish-es6'] },
  build: { target: 'es2022' },
});
