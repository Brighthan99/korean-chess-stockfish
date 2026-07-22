// Game record (gibo) import/export. (plan §7)
// - PGN: [Variant "Janggi"] + [FEN]/[SetUp], SAN moves — generated/parsed via ffish (PyChess-compatible)
// - .gib: KJA/JanggiDosa-family text — bracket headers + Korean-style coordinate moves (79졸78, 한수쉼 for pass)
// - Encoding: export as UTF-8; import auto-detects UTF-8/EUC-KR (legacy .gib is EUC-KR)
import type { FfishModule, FfishBoard } from './ffish';
import { fenFromAbsolute, fenPattern, KO_TO_ARR, DEFAULT_START_FEN } from './setups';
import { kjaMove, parseUci } from './notation';
import type { MoveRecord } from './game.svelte';

export interface ParsedGame {
  fen: string;
  moves: string[]; // UCI
}

// ---------- Common ----------

/** Download a text file. */
export function download(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Read a game record file — UTF-8 first, EUC-KR on failure (legacy .gib). */
export async function readGiboFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('euc-kr').decode(buf);
  }
}

/** Detect format: PGN (English bracket headers/SAN) vs .gib (Korean-style). */
export function detectFormat(text: string): 'pgn' | 'gib' {
  if (/\[\s*(Variant|FEN|Event|SetUp)\s+"/i.test(text)) return 'pgn';
  if (/\[(대회명|초대국자|한대국자|초차림|한차림|대국결과|총수)\s+"/.test(text)) return 'gib';
  if (/(졸|병|한수쉼)/.test(text)) return 'gib';
  return 'pgn';
}

function today(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// ---------- PGN ----------

export function toPgn(
  ffish: FfishModule,
  ruleset: string,
  startFen: string,
  moves: MoveRecord[],
  result: string | null,
): string {
  const res = result ?? '*';
  const headers = [
    `[Event "Korean Chess casual game"]`,
    `[Site "${typeof location !== 'undefined' ? location.host || 'local' : 'local'}"]`,
    `[Date "${today().replaceAll('-', '.')}"]`,
    `[Round "-"]`,
    `[White "Cho"]`,
    `[Black "Han"]`,
    `[Result "${res}"]`,
    `[Variant "Janggi"]`,
    `[SetUp "1"]`,
    `[FEN "${startFen}"]`,
  ];
  const b = new ffish.Board(ruleset, startFen);
  let movetext = '';
  try {
    movetext = b.variationSan(moves.map(m => m.uci).join(' '), ffish.Notation.SAN, true);
  } finally {
    b.delete();
  }
  return `${headers.join('\n')}\n\n${movetext} ${res}\n`;
}

export function fromPgn(ffish: FfishModule, text: string): ParsedGame {
  const game = ffish.readGamePGN(text) as {
    headers(item: string): string;
    mainlineMoves(): string;
    delete(): void;
  };
  try {
    const variant = (game.headers('Variant') || 'janggi').toLowerCase().replace(/\s/g, '');
    if (!variant.startsWith('janggi')) throw new Error('import.notJanggi');
    const fen = game.headers('FEN') || ffish.startingFen('janggi');
    const moves = game.mainlineMoves().trim();
    return { fen, moves: moves ? moves.split(/\s+/) : [] };
  } finally {
    game.delete();
  }
}

// ---------- .gib (KJA style) ----------

export interface GibMeta {
  choPlayer: string;
  hanPlayer: string;
}

const GIB_RESULT: Record<string, string> = {
  '1-0': '초 완승',
  '0-1': '한 완승',
  '1/2-1/2': '무승부',
};

export function toGib(startFen: string, moves: MoveRecord[], result: string | null, meta: GibMeta): string {
  const choPattern = fenPattern(startFen, 'cho') ?? '-';
  const hanPattern = fenPattern(startFen, 'han') ?? '-';
  const lines = [
    `[대회명 "Korean Chess"]`,
    `[대국일자 "${today()}"]`,
    `[초대국자 "${meta.choPlayer}"]`,
    `[한대국자 "${meta.hanPlayer}"]`,
    `[초차림 "${choPattern}"]`,
    `[한차림 "${hanPattern}"]`,
    `[총수 "${moves.length}"]`,
  ];
  if (result && GIB_RESULT[result]) lines.push(`[대국결과 "${GIB_RESULT[result]}"]`);
  // Preserve non-standard start positions via a FEN header (our own extension — legacy viewers ignore it)
  if (choPattern === '-' || hanPattern === '-' || !startFen.includes(' w - - 0 1') || startFen !== fenFromPatterns(choPattern, hanPattern)) {
    lines.push(`[FEN "${startFen}"]`);
  }
  const body: string[] = [];
  moves.forEach((m, i) => {
    body.push(`${i + 1}. ${kjaMove(m.uci, m.piece, m.captured, m.check)}`);
  });
  // wrap lines every 5 moves
  const rows: string[] = [];
  for (let i = 0; i < body.length; i += 5) rows.push(body.slice(i, i + 5).join('  '));
  return `${lines.join('\n')}\n\n${rows.join('\n')}\n`;
}

function fenFromPatterns(choKo: string, hanKo: string): string | null {
  const c = KO_TO_ARR[choKo];
  const h = KO_TO_ARR[hanKo];
  return c && h ? fenFromAbsolute(c, h, 'w') : null;
}

/** KJA coordinate ('79') → UCI ('i4'). Row '0' = row 10. */
function kjaSqToUci(rc: string): string | null {
  if (!/^\d\d$/.test(rc)) return null;
  let row = Number(rc[0]);
  if (row === 0) row = 10;
  const col = Number(rc[1]);
  if (col < 1 || col > 9) return null;
  return `${String.fromCharCode(96 + col)}${11 - row}`;
}

const GIB_MOVE = /^(\d\d)(차|포|마|상|사|졸|병|장|궁)(\d\d)/;

export function fromGib(ffish: FfishModule, ruleset: string, text: string): ParsedGame {
  // Headers
  const headers = new Map<string, string>();
  for (const m of text.matchAll(/\[(\S+)\s+"([^"]*)"\]/g)) headers.set(m[1]!, m[2]!);

  let fen = headers.get('FEN') ?? null;
  if (!fen) {
    const cho = headers.get('초차림');
    const han = headers.get('한차림');
    fen = (cho && han && fenFromPatterns(cho, han)) || DEFAULT_START_FEN;
  }

  // Moves: strip headers, then tokenize
  const bodyText = text.replace(/\[[^\]]*\]/g, ' ');
  const tokens = bodyText.split(/\s+/).filter(t => t && !/^\d+\.$/.test(t));

  const board: FfishBoard = new ffish.Board(ruleset, fen);
  const moves: string[] = [];
  try {
    for (const raw of tokens) {
      const token = raw.replace(/^\d+\./, ''); // handle "1.79졸78"-style tokens
      if (!token) continue;
      if (token.startsWith('한수쉼')) {
        const pass = board
          .legalMoves()
          .trim()
          .split(/\s+/)
          .find(u => {
            const mv = parseUci(u);
            return mv !== null && mv.from === mv.to;
          });
        if (!pass) throw new Error(`import.badMove:${moves.length + 1}`);
        board.push(pass);
        moves.push(pass);
        continue;
      }
      const m = GIB_MOVE.exec(token);
      if (!m) continue; // ignore unrelated tokens such as result markers
      const from = kjaSqToUci(m[1]!);
      const to = kjaSqToUci(m[3]!);
      if (!from || !to) throw new Error(`import.badMove:${moves.length + 1}`);
      const uci = `${from}${to}`;
      if (!board.push(uci)) throw new Error(`import.badMove:${moves.length + 1}`);
      moves.push(uci);
    }
  } finally {
    board.delete();
  }
  return { fen, moves };
}

// ---------- Combined ----------

export function parseGibo(ffish: FfishModule, ruleset: string, text: string): ParsedGame {
  const cleaned = text.replace(/^﻿/, '').trim();
  if (!cleaned) throw new Error('import.empty');
  return detectFormat(cleaned) === 'pgn' ? fromPgn(ffish, cleaned) : fromGib(ffish, ruleset, cleaned);
}
