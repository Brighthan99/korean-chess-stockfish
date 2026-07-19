// 진행 중 대국 자동 저장 (localStorage — 서버 없음, 기획서 §5.9)
import type { Mode, Ruleset } from './game.svelte';

const KEY = 'kc-game';

export interface SavedGame {
  fen: string;
  moves: string[];
  mode: Mode;
  humanColor: 'w' | 'b';
  aiMovetime: number;
  ruleset: Ruleset;
  dum: number;
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
    const data = JSON.parse(raw) as SavedGame;
    if (!data.fen || !Array.isArray(data.moves)) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSavedGame(): void {
  localStorage.removeItem(KEY);
}
