// 진행 중 대국 자동 저장 (localStorage — 서버 없음, 기획서 §5.9)
import type { Mode, Ruleset, KomiSide } from './game.svelte';

const KEY = 'kc-game';

export interface SavedGame {
  fen: string;
  moves: string[];
  mode: Mode;
  humanColor: 'w' | 'b';
  aiMovetime: number;
  ruleset: Ruleset;
  komi: number;
  /** 덤 받는 쪽 — 구버전 저장본에는 없을 수 있음 */
  komiSide?: KomiSide;
  /** 보드 방향 (아래쪽 진영) — 구버전 저장본에는 없을 수 있음 */
  orientation?: 'w' | 'b';
  result: string | null;
  ts: number;
}

export function saveGame(data: SavedGame): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* 저장 실패(용량 등)는 무시 */
  }
}

export function loadSavedGame(): SavedGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SavedGame & { dum?: number; dumSide?: KomiSide };
    if (!data.fen || !Array.isArray(data.moves)) return null;
    // 구버전 저장분 마이그레이션: dum/dumSide → komi/komiSide
    if (data.komi === undefined && data.dum !== undefined) data.komi = data.dum;
    if (data.komiSide === undefined && data.dumSide !== undefined) data.komiSide = data.dumSide;
    if (data.komi === undefined) data.komi = 1.5; // 표준 덤 (HAN_KOMI와 동일)
    return data;
  } catch {
    return null;
  }
}

export function clearSavedGame(): void {
  localStorage.removeItem(KEY);
}
