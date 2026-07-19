import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// 엔진 WASM(pthread)은 SharedArrayBuffer가 필요하므로 dev/preview에서도
// 배포(nginx)와 동일하게 COOP/COEP 헤더를 보낸다. (기획서 §3.4)
const crossOriginIsolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [svelte()],
  server: { headers: crossOriginIsolation },
  preview: { headers: crossOriginIsolation },
  // ffish-es6는 emscripten 산출물이라 사전 번들링에서 제외하고
  // wasm은 public/ffish/에서 locateFile로 로드한다 (scripts/copy-wasm.mjs).
  optimizeDeps: { exclude: ['ffish-es6'] },
  build: { target: 'es2022' },
});
