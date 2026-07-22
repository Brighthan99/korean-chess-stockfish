// Copy WASM artifacts from node_modules to public/.
// - The engine (fairy-stockfish-nnue.wasm) is served as static files under /engine/
//   without bundling, because the pthread worker is loaded via a relative path
//   (the fairyground approach).
// - ffish.wasm is loaded via locateFile('/ffish/ffish.wasm').
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');

const copies = [
  ['fairy-stockfish-nnue.wasm/stockfish.js', 'public/engine/stockfish.js'],
  ['fairy-stockfish-nnue.wasm/stockfish.wasm', 'public/engine/stockfish.wasm'],
  ['fairy-stockfish-nnue.wasm/stockfish.worker.js', 'public/engine/stockfish.worker.js'],
  ['ffish-es6/ffish.wasm', 'public/ffish/ffish.wasm'],
];

for (const [src, dst] of copies) {
  const from = join(nm, src);
  const to = join(root, dst);
  if (!existsSync(from)) {
    console.error(`missing: ${from} — run npm install first`);
    process.exit(1);
  }
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}
console.log('copy-wasm: engine + ffish wasm copied to public/');
