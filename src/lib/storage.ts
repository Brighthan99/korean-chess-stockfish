// Autosave of the game in progress (localStorage — no server, plan §5.9)
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
  /** Side receiving komi — may be absent in older saves */
  komiSide?: KomiSide;
  /** Board orientation (bottom side) — may be absent in older saves */
  orientation?: 'w' | 'b';
  result: string | null;
  ts: number;
}

export function saveGame(data: SavedGame): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* ignore save failures (quota, etc.) */
  }
}

export function loadSavedGame(): SavedGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SavedGame & { dum?: number; dumSide?: KomiSide };
    if (!data.fen || !Array.isArray(data.moves)) return null;
    // Migrate older saves: dum/dumSide → komi/komiSide
    if (data.komi === undefined && data.dum !== undefined) data.komi = data.dum;
    if (data.komiSide === undefined && data.dumSide !== undefined) data.komiSide = data.dumSide;
    if (data.komi === undefined) data.komi = 1.5; // standard komi (same as HAN_KOMI)
    return data;
  } catch {
    return null;
  }
}

export function clearSavedGame(): void {
  localStorage.removeItem(KEY);
}
