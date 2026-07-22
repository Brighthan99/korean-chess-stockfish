// Piece values and FEN board parsing. (plan §6.2)
// Chariot 13, cannon 7, horse 5, elephant 3, advisor 3, pawn 2, king 0 — 72 points per side. Han gets komi +1.5 (added at display time).

export const PIECE_VALUES: Record<string, number> = {
  r: 13,
  c: 7,
  n: 5,
  b: 3,
  a: 3,
  p: 2,
  k: 0,
};

export const HAN_KOMI = 1.5;

/** Parse the FEN board section into a map of uci square ('e2') → piece letter (uppercase = Cho). */
export function fenBoard(fen: string): Map<string, string> {
  const map = new Map<string, string>();
  const board = fen.split(' ')[0] ?? '';
  const ranks = board.split('/'); // from the top (rank 10, Han) downward
  const height = ranks.length;
  ranks.forEach((rankStr, i) => {
    const rank = height - i; // first FEN row = topmost rank
    let file = 0;
    for (const ch of rankStr) {
      if (ch >= '1' && ch <= '9') {
        file += Number(ch);
      } else {
        map.set(`${String.fromCharCode(97 + file)}${rank}`, ch);
        file += 1;
      }
    }
  });
  return map;
}

/** Total material score of the current position (komi excluded). */
export function materialScore(fen: string): { cho: number; han: number } {
  let cho = 0;
  let han = 0;
  for (const letter of fenBoard(fen).values()) {
    const v = PIECE_VALUES[letter.toLowerCase()] ?? 0;
    if (letter === letter.toUpperCase()) cho += v;
    else han += v;
  }
  return { cho, han };
}

/** King square of the given side — used for check highlighting. */
export function kingSquare(fen: string, color: 'w' | 'b'): string | null {
  const target = color === 'w' ? 'K' : 'k';
  for (const [sq, letter] of fenBoard(fen)) {
    if (letter === target) return sq;
  }
  return null;
}

// ===== Board editor constraints (plan §5.2 validation rules) =====

/** Per-side piece limits: king 1, advisor 2, chariot 2, cannon 2, horse 2, elephant 2, pawn 5 */
export const PIECE_LIMITS: Record<string, number> = {
  k: 1,
  a: 2,
  r: 2,
  c: 2,
  n: 2,
  b: 2,
  p: 5,
};

/** Whether a square is inside the palace — files d-f, ranks 1-3 for Cho, 8-10 for Han. */
export function isPalaceSquare(sq: string, color: 'w' | 'b'): boolean {
  const file = sq.charCodeAt(0) - 97; // a=0
  if (file < 3 || file > 5) return false;
  const rank = Number(sq.slice(1));
  return color === 'w' ? rank >= 1 && rank <= 3 : rank >= 8 && rank <= 10;
}

export interface EditorViolation {
  type: 'count' | 'palace';
  /** offending piece letter (uppercase = Cho) */
  piece: string;
  limit?: number;
}

/** Check editor position violations — piece count limits, king/advisor palace restriction. Null if none. */
export function findEditorViolation(boardFen: string): EditorViolation | null {
  const counts = new Map<string, number>();
  for (const [sq, letter] of fenBoard(boardFen)) {
    const lower = letter.toLowerCase();
    const color: 'w' | 'b' = letter === letter.toUpperCase() ? 'w' : 'b';
    // King and advisors must stay inside their own palace
    if ((lower === 'k' || lower === 'a') && !isPalaceSquare(sq, color)) {
      return { type: 'palace', piece: letter };
    }
    const n = (counts.get(letter) ?? 0) + 1;
    counts.set(letter, n);
    const limit = PIECE_LIMITS[lower];
    if (limit !== undefined && n > limit) {
      return { type: 'count', piece: letter, limit };
    }
  }
  return null;
}
