// node_modules의 WASM 산출물을 public/으로 복사한다.
// - 엔진(fairy-stockfish-nnue.wasm)은 pthread 워커가 상대 경로로 로드되므로
//   번들링하지 않고 /engine/ 아래 정적 파일로 서빙한다 (fairyground 방식).
// - ffish.wasm은 locateFile('/ffish/ffish.wasm')로 로드한다.
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
    console.error(`missing: ${from} — npm install을 먼저 실행하세요`);
    process.exit(1);
  }
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}
console.log('copy-wasm: engine + ffish wasm copied to public/');
