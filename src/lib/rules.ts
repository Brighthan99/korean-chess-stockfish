// 기물 점수와 FEN 보드 파싱. (기획서 §6.2)
// 차13 포7 마5 상3 사3 졸/병2, 궁 0 — 양측 합 72점. 한은 덤 +1.5 (표시 시 가산).

export const PIECE_VALUES: Record<string, number> = {
  r: 13,
  c: 7,
  n: 5,
  b: 3,
  a: 3,
  p: 2,
  k: 0,
};

export const HAN_DUM = 1.5;

/** FEN 보드 부분을 uci 좌표('e2') → 기물 문자(대문자=초) 맵으로 파싱한다. */
export function fenBoard(fen: string): Map<string, string> {
  const map = new Map<string, string>();
  const board = fen.split(' ')[0] ?? '';
  const ranks = board.split('/'); // 위(10랭크, 한)부터 아래로
  const height = ranks.length;
  ranks.forEach((rankStr, i) => {
    const rank = height - i; // FEN 첫 줄 = 최상단 랭크
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

/** 현재 국면의 기물 점수 합 (덤 미포함). */
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

/** 현재 수(手)의 왕(장) 위치 — 장군 표시에 사용. */
export function kingSquare(fen: string, color: 'w' | 'b'): string | null {
  const target = color === 'w' ? 'K' : 'k';
  for (const [sq, letter] of fenBoard(fen)) {
    if (letter === target) return sq;
  }
  return null;
}

// ===== 보드 에디터 제약 (기획서 §5.2 검증 규칙) =====

/** 진영당 기물 상한: 궁1 사2 차2 포2 마2 상2 졸/병5 */
export const PIECE_LIMITS: Record<string, number> = {
  k: 1,
  a: 2,
  r: 2,
  c: 2,
  n: 2,
  b: 2,
  p: 5,
};

/** 궁성(宮城) 칸 여부 — d~f열, 초는 1~3랭크, 한은 8~10랭크. */
export function isPalaceSquare(sq: string, color: 'w' | 'b'): boolean {
  const file = sq.charCodeAt(0) - 97; // a=0
  if (file < 3 || file > 5) return false;
  const rank = Number(sq.slice(1));
  return color === 'w' ? rank >= 1 && rank <= 3 : rank >= 8 && rank <= 10;
}

export interface EditorViolation {
  type: 'count' | 'palace';
  /** 위반한 기물 문자 (대문자 = 초) */
  piece: string;
  limit?: number;
}

/** 에디터 배치 위반 검사 — 기물 수 상한, 궁·사의 궁성 제한. 위반 없으면 null. */
export function findEditorViolation(boardFen: string): EditorViolation | null {
  const counts = new Map<string, number>();
  for (const [sq, letter] of fenBoard(boardFen)) {
    const lower = letter.toLowerCase();
    const color: 'w' | 'b' = letter === letter.toUpperCase() ? 'w' : 'b';
    // 궁·사는 자기 궁성 안에만
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
