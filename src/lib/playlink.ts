// /play deep link — parse & validate query parameters that start a game
// immediately. Format documentation: PLAY.md (repo root).
//
// Design notes:
// - Every parameter is optional; invalid or missing values fall back to their
//   defaults so a shared link always starts *some* game. Problems are
//   collected as warnings (logged to the console by the caller).
// - A valid `fen` overrides the setup parameters (cho/han/first).
// - The link is consumed once by game.autoStart(), which then rewrites the
//   URL back to '/' so a reload resumes the auto-saved game instead of
//   restarting it.
import type { GameConfig, Ruleset, KomiSide, Mode } from './game.svelte';
import type { FfishModule } from './ffish';
import type { SetupId } from './setups';
import { findEditorViolation } from './rules';

export interface PlayLink {
  choSetup: SetupId;
  hanSetup: SetupId;
  firstMover: 'w' | 'b';
  /** Non-null → start from this custom position instead of the setups. */
  fen: string | null;
  cfg: GameConfig;
  warnings: string[];
}

const SETUP_IDS = ['inner', 'left', 'right', 'outer'] as const;
const MODES = ['ai-cho', 'ai-han', 'manual'] as const;
const RULESETS = ['janggi', 'janggitraditional', 'janggimodern', 'janggicasual'] as const;
const SIDES = ['cho', 'han'] as const;
const KOMI_SIDES = ['han', 'cho', 'none'] as const;

// Structural bounds for the fen parameter ("length sufficiency" check):
// a minimal 10-rank janggi board ("4k4/9/.../4K4") is 19 chars; a full FEN
// with side/fields tops out well under 120.
const FEN_MIN_LENGTH = 19;
const FEN_MAX_LENGTH = 120;
const TIME_MIN = 100;
const TIME_MAX = 10000;

/** UI-level values for building a /play URL (see PLAY.md). */
export interface PlayLinkParams {
  cho?: SetupId;
  han?: SetupId;
  first: 'cho' | 'han';
  mode: 'ai-cho' | 'ai-han' | 'manual';
  time: number;
  rules: Ruleset;
  komi: KomiSide;
  komiPoints?: number;
  orient: 'cho' | 'han';
  /** Board-only FEN; when set, cho/han are omitted from the URL. */
  fen?: string;
}

/** Build a shareable /play URL from the currently selected options. */
export function buildPlayUrl(p: PlayLinkParams): string {
  const q = new URLSearchParams();
  if (!p.fen) {
    if (p.cho) q.set('cho', p.cho);
    if (p.han) q.set('han', p.han);
  }
  q.set('first', p.first);
  q.set('mode', p.mode);
  q.set('time', String(p.time));
  q.set('rules', p.rules);
  q.set('komi', p.komi);
  if (p.komi !== 'none' && p.komiPoints !== undefined) q.set('komiPoints', String(p.komiPoints));
  q.set('orient', p.orient);
  // Append the FEN unencoded for readability — janggi board FENs only contain
  // [a-zA-Z0-9/], all safe in a query string.
  const fenPart = p.fen ? `&fen=${p.fen}` : '';
  return `${location.origin}/play?${q.toString()}${fenPart}`;
}

export function parsePlayLink(search: string, ffish: FfishModule): PlayLink {
  const q = new URLSearchParams(search);
  const warnings: string[] = [];

  const pick = <T extends string>(name: string, allowed: readonly T[], dflt: T): T => {
    const v = q.get(name);
    if (v === null || v === '') return dflt;
    if ((allowed as readonly string[]).includes(v)) return v as T;
    warnings.push(`${name}: invalid value "${v}" — using "${dflt}"`);
    return dflt;
  };

  const choSetup = pick('cho', SETUP_IDS, 'inner');
  const hanSetup = pick('han', SETUP_IDS, 'inner');
  const firstMover: 'w' | 'b' = pick('first', SIDES, 'cho') === 'han' ? 'b' : 'w';
  const modeParam = pick('mode', MODES, 'ai-cho');
  const mode: Mode = modeParam === 'manual' ? 'manual' : 'ai';
  const humanColor: 'w' | 'b' = modeParam === 'ai-han' ? 'b' : 'w';
  const ruleset: Ruleset = pick('rules', RULESETS, 'janggi');
  const komiSide: KomiSide = pick('komi', KOMI_SIDES, 'han');

  // time: any integer (ms) within sane bounds, not just the three UI presets
  let aiMovetime = 1000;
  const timeRaw = q.get('time');
  if (timeRaw !== null && timeRaw !== '') {
    const n = Number(timeRaw);
    if (Number.isInteger(n) && n >= TIME_MIN && n <= TIME_MAX) aiMovetime = n;
    else warnings.push(`time: "${timeRaw}" is not an integer in ${TIME_MIN}..${TIME_MAX} — using 1000`);
  }

  // komiPoints: non-negative number, capped at 72 (a full side's material)
  let komi = 1.5;
  const komiRaw = q.get('komiPoints');
  if (komiRaw !== null && komiRaw !== '') {
    const n = Number(komiRaw);
    if (Number.isFinite(n) && n >= 0 && n <= 72) komi = n;
    else warnings.push(`komiPoints: "${komiRaw}" is not a number in 0..72 — using 1.5`);
  }

  // orient: defaults to "my side at the bottom" for AI games, Cho otherwise
  const orientRaw = q.get('orient');
  let orientation: 'w' | 'b' = modeParam === 'ai-han' ? 'b' : 'w';
  if (orientRaw !== null && orientRaw !== '') {
    if (orientRaw === 'cho') orientation = 'w';
    else if (orientRaw === 'han') orientation = 'b';
    else warnings.push(`orient: invalid value "${orientRaw}" — using the default`);
  }

  // fen: overrides cho/han/first when structurally and legally valid
  let fen: string | null = null;
  const fenRaw = (q.get('fen') ?? '').trim();
  if (fenRaw) {
    if (fenRaw.length < FEN_MIN_LENGTH) {
      warnings.push(`fen: too short (${fenRaw.length} chars; a full 10-rank board needs at least ${FEN_MIN_LENGTH}) — ignored`);
    } else if (fenRaw.length > FEN_MAX_LENGTH) {
      warnings.push(`fen: too long (${fenRaw.length} chars; max ${FEN_MAX_LENGTH}) — ignored`);
    } else {
      // Accept a board-only FEN; fill in side-to-move from `first` and dummy fields
      const candidate = fenRaw.includes(' ') ? fenRaw : `${fenRaw} ${firstMover} - - 0 1`;
      const board = candidate.split(' ')[0] ?? '';
      if (ffish.validateFen(candidate, ruleset) !== 1) {
        warnings.push('fen: rejected by the rules engine — ignored');
      } else if (findEditorViolation(board) !== null) {
        warnings.push('fen: violates piece-count/palace constraints — ignored');
      } else {
        fen = candidate;
      }
    }
  }

  return {
    choSetup,
    hanSetup,
    firstMover,
    fen,
    cfg: { mode, humanColor, aiMovetime, ruleset, komi, komiSide, orientation },
    warnings,
  };
}
