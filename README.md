# Korean Chess (Janggi) — play vs AI in the browser

A web app for playing **Janggi** (Korean chess, 장기) against an AI, entirely in the browser —
no server-side game logic, powered by [Fairy-Stockfish](https://github.com/fairy-stockfish/Fairy-Stockfish)
compiled to WebAssembly.

## Features

- Play vs AI (three thinking-time levels) or two-player local games
- All 16 opening setups (each side independently chooses one of the four 차림 / horse-elephant arrangements)
- Rule sets: tournament (bikjang + point counting), traditional, modern (Kakao-compatible), casual
- Score board with Han's 1.5-point compensation (덤), pass move (한수쉼), check/bikjang indicators
- Undo / redo, last-move highlight, AI hint, live engine analysis (eval bar + principal variation)
- Board editor: free piece placement with per-side piece limits and palace constraints, custom compensation
- Game records: import/export **PGN** (`[Variant "Janggi"]`), Korean **`.gib`** notation
  (KJA-style `79졸78`, EUC-KR auto-detected on import), FEN copy/paste
- Unfinished games are auto-saved to the browser and restored on the next visit
- Optional **strong AI (NNUE, +1128 Elo)**: download the official `janggi-*.nnue` net from the
  [Fairy-Stockfish NNUE page](https://fairy-stockfish.github.io/nnue/) and select it in the app;
  it is stored in IndexedDB and re-applied automatically (this repository does not redistribute the net)
- UI in Korean and English

## Development

```bash
npm install
npm run dev      # copies WASM artifacts (predev), then starts Vite with COOP/COEP headers
npm run build    # production build into dist/
npm run check    # svelte-check
```

The engine WASM is multithreaded and requires `SharedArrayBuffer`, so the site must be served with:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

The dev/preview servers already send these headers (see `vite.config.ts`). Configure the same
headers on your production web server.

`public/engine/` and `public/ffish/` are populated from `node_modules` by `scripts/copy-wasm.mjs`
(run automatically before dev/build) and are not committed.

## Stack

| Role | Library | License |
|---|---|---|
| Rules / move validation | [ffish-es6](https://www.npmjs.com/package/ffish-es6) 0.7.9 (pinned) | GPL-3.0 |
| Engine | [fairy-stockfish-nnue.wasm](https://github.com/fairy-stockfish/fairy-stockfish.wasm) 1.1.11 (pinned) | GPL-3.0 |
| Board UI | [chessgroundx](https://github.com/gbtami/chessgroundx) | GPL-3.0 |
| App | Svelte 5 + Vite + TypeScript | MIT |

Note: `ffish-es6` and `fairy-stockfish-nnue.wasm` are version-locked as a matched pair — do not upgrade one without the other.

## License

**GPL-3.0-or-later** — see [LICENSE](LICENSE). This repository is the corresponding source
for the deployed website.

### Asset credits

- Piece and board graphics by [Kadagaden](https://github.com/Kadagaden/chess-pieces),
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — see
  [public/pieces/LICENSE.md](public/pieces/LICENSE.md)
- Move sounds are original works synthesized for this project (`scripts/gen_sounds.py`)
- Engine and rules libraries: [Fairy-Stockfish](https://github.com/fairy-stockfish/Fairy-Stockfish)
  and derivatives, GPL-3.0
