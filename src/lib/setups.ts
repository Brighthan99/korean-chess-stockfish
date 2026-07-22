// Opening setup (horse/elephant arrangement) data and start FEN generation. (plan §6.1)
// FEN and gibo headers use absolute board coordinates (Cho's view), so Han's setup,
// chosen from Han's own seat, is mirrored left-right into absolute coordinates.

export type SetupId = 'inner' | 'left' | 'right' | 'outer';

export interface SetupInfo {
  id: SetupId;
  pattern: string; // columns 2/3/7/8 from the player's own seat (display only — names/descriptions are i18n keys setup.name.*, setup.desc.*)
}

export const SETUPS: SetupInfo[] = [
  { id: 'inner', pattern: '마상상마' },
  { id: 'left', pattern: '상마상마' },
  { id: 'right', pattern: '마상마상' },
  { id: 'outer', pattern: '상마마상' },
];

// Pieces on files b,c,g,h from the player's own seat (n=horse, b=elephant)
const ARRANGEMENT: Record<SetupId, string> = {
  inner: 'nbbn', // horse-elephant-elephant-horse (마상상마)
  left: 'bnbn', // elephant-horse-elephant-horse (상마상마)
  right: 'nbnb', // horse-elephant-horse-elephant (마상마상)
  outer: 'bnnb', // elephant-horse-horse-elephant (상마마상)
};

/** Build a start FEN from absolute-coordinate arrangements (columns 2/3/7/8, 'nbbn' form). */
export function fenFromAbsolute(choArr: string, hanArr: string, firstMover: 'w' | 'b'): string {
  const c = choArr;
  const h = hanArr;
  const choRank = `R${c[0]}${c[1]}A1A${c[2]}${c[3]}R`.toUpperCase();
  const hanRank = `r${h[0]}${h[1]}a1a${h[2]}${h[3]}r`;
  return `${hanRank}/4k4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/${choRank} ${firstMover} - - 0 1`;
}

/** Build a start FEN from Cho/Han setups (each from the player's own seat) and the first mover. */
export function buildStartFen(cho: SetupId, han: SetupId, firstMover: 'w' | 'b'): string {
  // Han's choice is seat-relative → mirror left-right into absolute coordinates
  return fenFromAbsolute(ARRANGEMENT[cho], [...ARRANGEMENT[han]].reverse().join(''), firstMover);
}

// Absolute-coordinate arrangement ↔ Korean setup name (KJA gibo headers use absolute coordinates)
export const ARR_TO_KO: Record<string, string> = {
  nbbn: '마상상마',
  bnbn: '상마상마',
  nbnb: '마상마상',
  bnnb: '상마마상',
};
export const KO_TO_ARR: Record<string, string> = Object.fromEntries(
  Object.entries(ARR_TO_KO).map(([k, v]) => [v, k]),
);

/** Read the absolute-coordinate setup name from a FEN back rank (null for non-standard positions). */
export function fenPattern(fen: string, side: 'cho' | 'han'): string | null {
  const board = fen.split(' ')[0] ?? '';
  const ranks = board.split('/');
  const rank = side === 'cho' ? ranks[ranks.length - 1] : ranks[0];
  if (!rank || rank.length !== 9) return null;
  const arr = (rank[1]! + rank[2]! + rank[6]! + rank[7]!).toLowerCase();
  return ARR_TO_KO[arr] ?? null;
}

export const DEFAULT_START_FEN = buildStartFen('inner', 'inner', 'w');
