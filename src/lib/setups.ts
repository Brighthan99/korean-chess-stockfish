// 차림(마상 배치) 데이터와 시작 FEN 생성. (기획서 §6.1)
// FEN·기보 헤더는 보드 절대좌표(초 시점) 기준이므로, 한의 차림은
// 자기 자리 기준 선택을 좌우 반전해 절대좌표로 변환한다.

export type SetupId = 'inner' | 'left' | 'right' | 'outer';

export interface SetupInfo {
  id: SetupId;
  pattern: string; // 자기 자리 기준 2·3·7·8열 배열 (표시용 — 이름/설명은 i18n 키 setup.name.*, setup.desc.*)
}

export const SETUPS: SetupInfo[] = [
  { id: 'inner', pattern: '마상상마' },
  { id: 'left', pattern: '상마상마' },
  { id: 'right', pattern: '마상마상' },
  { id: 'outer', pattern: '상마마상' },
];

// 자기 자리 기준 b,c,g,h열의 기물 (n=마, b=상)
const ARRANGEMENT: Record<SetupId, string> = {
  inner: 'nbbn', // 마상상마
  left: 'bnbn', // 상마상마
  right: 'nbnb', // 마상마상
  outer: 'bnnb', // 상마마상
};

/** 절대좌표 배열(2·3·7·8열, 'nbbn' 형식)로 시작 FEN을 만든다. */
export function fenFromAbsolute(choArr: string, hanArr: string, firstMover: 'w' | 'b'): string {
  const c = choArr;
  const h = hanArr;
  const choRank = `R${c[0]}${c[1]}A1A${c[2]}${c[3]}R`.toUpperCase();
  const hanRank = `r${h[0]}${h[1]}a1a${h[2]}${h[3]}r`;
  return `${hanRank}/4k4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/${choRank} ${firstMover} - - 0 1`;
}

/** 초·한 차림(자기 자리 기준)과 선수(先手)로 시작 FEN을 만든다. */
export function buildStartFen(cho: SetupId, han: SetupId, firstMover: 'w' | 'b'): string {
  // 한은 자기 자리 기준 → 절대좌표로 좌우 반전
  return fenFromAbsolute(ARRANGEMENT[cho], [...ARRANGEMENT[han]].reverse().join(''), firstMover);
}

// 절대좌표 배열 ↔ 한국식 차림 이름 (KJA 기보 헤더는 절대좌표 기준)
export const ARR_TO_KO: Record<string, string> = {
  nbbn: '마상상마',
  bnbn: '상마상마',
  nbnb: '마상마상',
  bnnb: '상마마상',
};
export const KO_TO_ARR: Record<string, string> = Object.fromEntries(
  Object.entries(ARR_TO_KO).map(([k, v]) => [v, k]),
);

/** FEN 백랭크에서 절대좌표 차림 이름을 읽는다 (비표준 배치면 null). */
export function fenPattern(fen: string, side: 'cho' | 'han'): string | null {
  const board = fen.split(' ')[0] ?? '';
  const ranks = board.split('/');
  const rank = side === 'cho' ? ranks[ranks.length - 1] : ranks[0];
  if (!rank || rank.length !== 9) return null;
  const arr = (rank[1]! + rank[2]! + rank[6]! + rank[7]!).toLowerCase();
  return ARR_TO_KO[arr] ?? null;
}

export const DEFAULT_START_FEN = buildStartFen('inner', 'inner', 'w');
