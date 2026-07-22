// Coordinate conversion and Korean-style (Korea Janggi Association style) notation. (plan §7.2–7.3)
//
// KJA coordinates: row (1→10, top to bottom, 10 is written "0") + column (1→9, from the left), row first.
// UCI coordinates: file (a→i, from the left) + rank (1→10, bottom (Cho) to top). Conversion: row = 11 − rank.
// chessgroundx internal keys: rank 10 is written as ':' (a10 → 'a:').

const UCI_SQ = /^([a-i])(10|[1-9])$/;

export interface UciMove {
  from: string;
  to: string;
}

/** Parse a UCI move of the form 'e2e2' (incl. pass). */
export function parseUci(uci: string): UciMove | null {
  const m = /^([a-i](?:10|[1-9]))([a-i](?:10|[1-9]))$/.exec(uci);
  if (!m) return null;
  return { from: m[1]!, to: m[2]! };
}

/** UCI square ('a10') → chessgroundx key ('a:'). */
export function uciToKey(sq: string): string {
  const m = UCI_SQ.exec(sq);
  if (!m) return sq;
  return m[2] === '10' ? `${m[1]}:` : sq;
}

/** chessgroundx key ('a:') → UCI square ('a10'). */
export function keyToUci(key: string): string {
  return key.endsWith(':') ? `${key[0]}10` : key;
}

/** UCI square → two-digit KJA coordinate ('i4' → '79'). Row 10 is written '0'. */
export function kjaSquare(sq: string): string {
  const m = UCI_SQ.exec(sq);
  if (!m) return sq;
  const col = m[1]!.charCodeAt(0) - 96; // a=1
  const row = 11 - Number(m[2]); // 1 (top/Han) to 10 (bottom/Cho)
  return `${row === 10 ? 0 : row}${col}`;
}

const PIECE_KO: Record<string, string> = {
  r: '차',
  n: '마',
  b: '상',
  a: '사',
  c: '포',
  k: '장',
};

// English notation (pychess-family convention): Chariot/Horse/Elephant/Advisor/Cannon/King/Pawn
const PIECE_EN: Record<string, string> = {
  r: 'R',
  n: 'H',
  b: 'E',
  a: 'A',
  c: 'C',
  k: 'K',
  p: 'P',
};

/** Piece letter (case-sensitive) → Korean name. Distinguishes 졸 (Cho pawn) / 병 (Han pawn). */
export function pieceKo(letter: string): string {
  const lower = letter.toLowerCase();
  if (lower === 'p') return letter === 'P' ? '졸' : '병';
  return PIECE_KO[lower] ?? letter;
}

/** Piece letter → single English letter. */
export function pieceEn(letter: string): string {
  return PIECE_EN[letter.toLowerCase()] ?? letter.toUpperCase();
}

/**
 * KJA-style move notation: [from]piece[to][captured][check], pass is '한수쉼'.
 * e.g. i4h4 (pawn) → '79졸78', capture + check → '92차12차장군'
 */
export function kjaMove(uci: string, piece: string | undefined, captured?: string, check?: boolean): string {
  const mv = parseUci(uci);
  if (!mv || mv.from === mv.to) return '한수쉼';
  let s = kjaSquare(mv.from) + (piece ? pieceKo(piece) : '') + kjaSquare(mv.to);
  if (captured) s += pieceKo(captured);
  if (check) s += '장군';
  return s;
}

/**
 * Per-locale move notation.
 * ko: KJA style (79졸78 / 한수쉼), en: coordinates + English piece letters (79P-78, xP capture, + check, pass)
 */
export function formatMove(
  uci: string,
  piece: string | undefined,
  captured: string | undefined,
  check: boolean,
  locale: 'ko' | 'en',
): string {
  if (locale === 'ko') return kjaMove(uci, piece, captured, check);
  const mv = parseUci(uci);
  if (!mv || mv.from === mv.to) return 'pass';
  let s = `${kjaSquare(mv.from)}${piece ? pieceEn(piece) : ''}-${kjaSquare(mv.to)}`;
  if (captured) s += `x${pieceEn(captured)}`;
  if (check) s += '+';
  return s;
}
