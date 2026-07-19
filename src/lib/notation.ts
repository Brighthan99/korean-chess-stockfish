// 좌표 변환과 한국식(대한장기협회 스타일) 기보 표기. (기획서 §7.2–7.3)
//
// KJA 좌표: 행(1→10, 위에서 아래, 10은 "0") + 열(1→9, 왼쪽부터), 행 먼저.
// UCI 좌표: 파일(a→i, 왼쪽부터) + 랭크(1→10, 아래(초)에서 위). 변환: row = 11 − rank.
// chessgroundx 내부 키: 랭크 10을 ':' 문자로 표기 (a10 → 'a:').

const UCI_SQ = /^([a-i])(10|[1-9])$/;

export interface UciMove {
  from: string;
  to: string;
}

/** 'e2e2'(한수쉼 포함) 형태의 UCI 수를 분해한다. */
export function parseUci(uci: string): UciMove | null {
  const m = /^([a-i](?:10|[1-9]))([a-i](?:10|[1-9]))$/.exec(uci);
  if (!m) return null;
  return { from: m[1]!, to: m[2]! };
}

/** UCI 좌표('a10') → chessgroundx 키('a:'). */
export function uciToKey(sq: string): string {
  const m = UCI_SQ.exec(sq);
  if (!m) return sq;
  return m[2] === '10' ? `${m[1]}:` : sq;
}

/** chessgroundx 키('a:') → UCI 좌표('a10'). */
export function keyToUci(key: string): string {
  return key.endsWith(':') ? `${key[0]}10` : key;
}

/** UCI 좌표 → KJA 두 자리 좌표 ('i4' → '79'). 행 10은 '0'. */
export function kjaSquare(sq: string): string {
  const m = UCI_SQ.exec(sq);
  if (!m) return sq;
  const col = m[1]!.charCodeAt(0) - 96; // a=1
  const row = 11 - Number(m[2]); // 1(위/한) ~ 10(아래/초)
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

// 영문 표기 (pychess 계열 관례): Chariot/Horse/Elephant/Advisor/Cannon/King/Pawn
const PIECE_EN: Record<string, string> = {
  r: 'R',
  n: 'H',
  b: 'E',
  a: 'A',
  c: 'C',
  k: 'K',
  p: 'P',
};

/** 기물 문자(대소문자 구분) → 한국어 이름. 졸(초)/병(한) 구분. */
export function pieceKo(letter: string): string {
  const lower = letter.toLowerCase();
  if (lower === 'p') return letter === 'P' ? '졸' : '병';
  return PIECE_KO[lower] ?? letter;
}

/** 기물 문자 → 영문 한 글자. */
export function pieceEn(letter: string): string {
  return PIECE_EN[letter.toLowerCase()] ?? letter.toUpperCase();
}

/**
 * KJA 스타일 수 표기: [출발]기물[도착][잡은기물][장군], 패스는 '한수쉼'.
 * 예: i4h4(졸) → '79졸78', 캡처+장군 → '92차12차장군'
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
 * locale별 수 표기.
 * ko: KJA 스타일 (79졸78 / 한수쉼), en: 좌표+영문 기물 (79P-78, xP 캡처, + 장군, pass)
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
