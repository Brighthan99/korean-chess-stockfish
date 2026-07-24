// Game state controller (Svelte 5 runes). ffish handles rule adjudication; engine handles the AI.
import { initFfish, type FfishModule, type FfishBoard } from './ffish';
import { engine, type SearchInfo } from './engine';
import { buildStartFen, type SetupId } from './setups';
import { materialScore, fenBoard, kingSquare, HAN_KOMI } from './rules';
import { parseUci, uciToKey } from './notation';
import { playSound } from './sound';
import { saveGame, loadSavedGame, type SavedGame } from './storage';
import { saveNnue, loadNnue, deleteNnue, isValidNnueFile } from './nnue';
import { parsePlayLink } from './playlink';

export type Mode = 'ai' | 'manual';
export type Ruleset = 'janggi' | 'janggitraditional' | 'janggimodern' | 'janggicasual';

// Notation is generated per locale at render time, so only metadata is stored.
export interface MoveRecord {
  ply: number;
  uci: string;
  color: 'w' | 'b';
  piece?: string;
  captured?: string;
  check: boolean;
}

export interface GameConfig {
  mode: Mode;
  humanColor: 'w' | 'b'; // side the human plays when mode === 'ai'
  aiMovetime: number;
  ruleset: Ruleset;
  /** Komi points. 1.5 for default setups, user-defined for custom positions. (plan §5.4) */
  komi: number;
  /** Side receiving komi — defaults to Han (second-mover compensation). */
  komiSide?: KomiSide;
  /** Board orientation — the side placed at the bottom. Defaults to my side in AI mode, otherwise Cho. */
  orientation?: 'w' | 'b';
}

export type KomiSide = 'han' | 'cho' | 'none';

export interface SetupChoice extends GameConfig {
  choSetup: SetupId;
  hanSetup: SetupId;
  firstMover: 'w' | 'b';
}

class GameState {
  phase = $state<'boot' | 'play'>('boot');
  /** Overlay above the game screen: new-game options / board editor */
  overlay = $state<'setup' | 'edit' | null>(null);

  // Settings
  mode = $state<Mode>('ai');
  humanColor = $state<'w' | 'b'>('w');
  aiMovetime = $state(1000);
  ruleset = $state<Ruleset>('janggi');
  komi = $state(HAN_KOMI);
  /** Side receiving komi — changeable mid-game. */
  komiSide = $state<KomiSide>('han');
  /** Board orientation — bottom side. Can be flipped mid-game. */
  orientation = $state<'w' | 'b'>('w');

  // Game state
  startFen = $state('');
  moves = $state<MoveRecord[]>([]);
  redoStack = $state<string[]>([]); // undone moves (in replay order)
  boardFen = $state('');
  turn = $state<'w' | 'b'>('w');
  lastMove = $state<[string, string] | null>(null); // cg keys
  checkKey = $state<string | null>(null); // king square when in check (cg key)
  bikjang = $state(false);
  canPass = $state(false);
  result = $state<string | null>(null); // '1-0' | '0-1' | '1/2-1/2'
  resigned = $state(false);
  score = $state({ cho: 72, han: 72 + HAN_KOMI });
  dests = $state<Map<string, string[]>>(new Map());

  // Engine state
  engineReady = $state(false);
  engineError = $state<string | null>(null);
  thinking = $state(false);

  // NNUE (strong AI — user-upload approach)
  nnueName = $state<string | null>(null); // net filename stored in IndexedDB
  nnueActive = $state(false);
  nnueBusy = $state(false);
  nnueError = $state<string | null>(null); // i18n key
  hint = $state<[string, string] | null>(null); // cg keys
  analysisOn = $state(false);
  evalInfo = $state<SearchInfo | null>(null);
  evalPv = $state('');

  private ffishMod: FfishModule | null = null;
  private board: FfishBoard | null = null;
  private seq = 0; // invalidates in-flight AI replies on undo/new game

  /** Load ffish (once at app startup). */
  async init(): Promise<void> {
    this.ffishMod = await initFfish();
  }

  get ffish(): FfishModule | null {
    return this.ffishMod;
  }

  /** Load the engine (on first game start). Manual play still works if it fails. */
  private async ensureEngine(): Promise<boolean> {
    try {
      await engine.init();
      this.engineReady = true;
      this.engineError = null;
      return true;
    } catch (e) {
      this.engineReady = false;
      this.engineError = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  get aiColor(): 'w' | 'b' {
    return this.humanColor === 'w' ? 'b' : 'w';
  }

  get movesUci(): string[] {
    return this.moves.map(m => m.uci);
  }

  /**
   * App entry: restore an unfinished saved game if any, otherwise start immediately with defaults.
   * (Defaults: inner-elephant setup on both sides, Cho first, vs AI (I play Cho), 1s, tournament rules, komi 1.5)
   */
  async autoStart(): Promise<void> {
    await this.init();

    // /play deep link: start immediately with the options given as query
    // parameters (see PLAY.md). Consumed once — the URL is rewritten back to
    // '/' so a reload resumes the auto-saved game instead of restarting.
    if (location.pathname === '/play') {
      const link = parsePlayLink(location.search, this.ffishMod!);
      history.replaceState(null, '', '/');
      for (const w of link.warnings) console.warn(`[/play] ${w}`);
      if (link.fen) {
        await this.startFromFen(link.fen, link.cfg);
      } else {
        await this.startGame({
          choSetup: link.choSetup,
          hanSetup: link.hanSetup,
          firstMover: link.firstMover,
          ...link.cfg,
        });
      }
      void this.initNnue(); // restore saved NNUE in the background
      return;
    }

    const saved = loadSavedGame();
    // Restore an unfinished game even with no moves — keeps orientation, mode, rules, etc.
    if (saved && !saved.result) {
      if (await this.resumeSaved()) {
        void this.initNnue(); // restore saved NNUE in the background
        return;
      }
    }
    await this.startGame({
      choSetup: 'inner',
      hanSetup: 'inner',
      firstMover: 'w',
      mode: 'ai',
      humanColor: 'w',
      aiMovetime: 1000,
      ruleset: 'janggi',
      komi: HAN_KOMI,
    });
    void this.initNnue(); // restore saved NNUE in the background
  }

  /** Restore saved NNUE — called at app start (auto-applied if previously enabled). */
  async initNnue(): Promise<void> {
    const stored = await loadNnue();
    if (!stored) return;
    this.nnueName = stored.name;
    if (localStorage.getItem('kc-nnue-on') === '1' && this.engineReady) {
      await this.applyNnue(stored.name, stored.bytes);
    }
  }

  private async applyNnue(name: string, bytes: ArrayBuffer): Promise<void> {
    this.nnueBusy = true;
    this.nnueError = null;
    try {
      await engine.setNnue(name, new Uint8Array(bytes));
      this.nnueActive = true;
      localStorage.setItem('kc-nnue-on', '1');
    } catch {
      this.nnueError = 'nnue.error';
    } finally {
      this.nnueBusy = false;
      if (this.analysisOn) this.restartAnalysis();
    }
  }

  /** Register a user-selected .nnue file and apply it immediately. */
  async setNnueFile(file: File): Promise<void> {
    this.nnueError = null;
    if (!isValidNnueFile(file.name, file.size)) {
      this.nnueError = 'nnue.invalidFile';
      return;
    }
    const bytes = await file.arrayBuffer();
    await saveNnue(file.name, bytes);
    this.nnueName = file.name;
    await this.applyNnue(file.name, bytes);
  }

  /** Toggle strong AI on/off. */
  async toggleNnue(): Promise<void> {
    if (this.nnueBusy || !this.engineReady) return;
    if (this.nnueActive) {
      this.nnueBusy = true;
      try {
        await engine.disableNnue();
        this.nnueActive = false;
        localStorage.setItem('kc-nnue-on', '0');
      } finally {
        this.nnueBusy = false;
        if (this.analysisOn) this.restartAnalysis();
      }
    } else {
      const stored = await loadNnue();
      if (stored) await this.applyNnue(stored.name, stored.bytes);
    }
  }

  /** Delete the stored net. */
  async removeNnue(): Promise<void> {
    if (this.nnueBusy) return;
    await deleteNnue();
    if (this.nnueActive) {
      await engine.disableNnue().catch(() => {});
      this.nnueActive = false;
    }
    this.nnueName = null;
    this.nnueError = null;
    localStorage.removeItem('kc-nnue-on');
  }

  /** Start a game from opening setup selection. */
  async startGame(cfg: SetupChoice): Promise<void> {
    await this.begin(buildStartFen(cfg.choSetup, cfg.hanSetup, cfg.firstMover), cfg);
  }

  /** Start a game from an arbitrary FEN (editor/import). */
  async startFromFen(fen: string, cfg: GameConfig): Promise<void> {
    await this.begin(fen, cfg);
  }

  /** Load a game record — replay start FEN + moves, then leave it ready to continue. */
  async loadGame(fen: string, movesUci: string[], cfg: GameConfig): Promise<void> {
    await this.begin(fen, cfg, { silent: true });
    for (const uci of movesUci) {
      if (!this.applyMove(uci, { sound: false })) break;
    }
    this.autosave();
    this.maybeAiMove();
    if (this.analysisOn) this.restartAnalysis();
  }

  /** Resume the game saved in localStorage. */
  async resumeSaved(): Promise<boolean> {
    const saved = loadSavedGame();
    if (!saved) return false;
    await this.loadGame(saved.fen, saved.moves, {
      mode: saved.mode,
      humanColor: saved.humanColor,
      aiMovetime: saved.aiMovetime,
      ruleset: saved.ruleset,
      komi: saved.komi,
      komiSide: saved.komiSide,
      orientation: saved.orientation,
    });
    return true;
  }

  /** Flip the board vertically (anytime during a game). */
  flipOrientation(): void {
    this.orientation = this.orientation === 'w' ? 'b' : 'w';
    this.autosave();
  }

  /** Change the komi-receiving side (anytime during a game) — scoreboard updates immediately. */
  setKomiSide(side: KomiSide): void {
    this.komiSide = side;
    this.refresh();
    this.autosave();
  }

  private async begin(fen: string, cfg: GameConfig, opts: { silent?: boolean } = {}): Promise<void> {
    if (!this.ffishMod) await this.init();
    this.mode = cfg.mode;
    this.humanColor = cfg.humanColor;
    this.aiMovetime = cfg.aiMovetime;
    this.ruleset = cfg.ruleset;
    this.komi = cfg.komi;
    this.komiSide = cfg.komiSide ?? 'han';
    this.orientation =
      cfg.orientation ?? (cfg.mode === 'ai' && cfg.humanColor === 'b' ? 'b' : 'w');

    this.seq++;
    this.startFen = fen;
    this.board?.delete();
    this.board = new this.ffishMod!.Board(this.ruleset, fen);
    this.moves = [];
    this.redoStack = [];
    this.lastMove = null;
    this.hint = null;
    this.result = null;
    this.resigned = false;
    this.evalInfo = null;
    this.evalPv = '';
    this.refresh();
    this.phase = 'play';
    this.overlay = null; // close the overlay once the game starts
    if (!opts.silent) playSound('start');

    const ok = await this.ensureEngine();
    if (ok) await engine.newGame(this.ruleset);
    if (!opts.silent) {
      this.autosave();
      this.maybeAiMove();
      if (this.analysisOn) this.restartAnalysis();
    }
  }

  private autosave(): void {
    if (this.phase !== 'play') return;
    const data: SavedGame = {
      fen: this.startFen,
      moves: this.movesUci,
      mode: this.mode,
      humanColor: this.humanColor,
      aiMovetime: this.aiMovetime,
      ruleset: this.ruleset,
      komi: this.komi,
      komiSide: this.komiSide,
      orientation: this.orientation,
      result: this.result,
      ts: Date.now(),
    };
    saveGame(data);
  }

  /** Recompute state derived from the board. */
  private refresh(): void {
    const b = this.board;
    if (!b) return;
    this.boardFen = b.fen();
    this.turn = b.turn() ? 'w' : 'b';

    const legal = b.legalMoves().trim();
    const dests = new Map<string, string[]>();
    let canPass = false;
    if (legal) {
      for (const uci of legal.split(/\s+/)) {
        const mv = parseUci(uci);
        if (!mv) continue;
        if (mv.from === mv.to) {
          canPass = true; // pass is offered via a button
          continue;
        }
        const from = uciToKey(mv.from);
        const arr = dests.get(from);
        if (arr) arr.push(uciToKey(mv.to));
        else dests.set(from, [uciToKey(mv.to)]);
      }
    }
    this.dests = dests;
    this.canPass = canPass;

    const inCheck = b.isCheck();
    const kingSq = inCheck ? kingSquare(this.boardFen, this.turn) : null;
    this.checkKey = kingSq ? uciToKey(kingSq) : null;
    this.bikjang = b.isBikjang();

    const mat = materialScore(this.boardFen);
    this.score = {
      cho: mat.cho + (this.komiSide === 'cho' ? this.komi : 0),
      han: mat.han + (this.komiSide === 'han' ? this.komi : 0),
    };

    if (b.isGameOver()) {
      this.result = b.result();
    } else if (!legal) {
      // no legal moves = the side unable to move loses (checkmate)
      this.result = this.turn === 'w' ? '0-1' : '1-0';
    }
  }

  /** Core move application (shared path incl. redo/import — no AI trigger, no redo reset). */
  private applyMove(uci: string, opts: { sound?: boolean } = {}): boolean {
    const b = this.board;
    if (!b || this.result) return false;
    const mv = parseUci(uci);
    if (!mv) return false;

    const map = fenBoard(this.boardFen);
    const piece = map.get(mv.from);
    const captured = b.isCapture(uci) ? map.get(mv.to) : undefined;
    const color = this.turn;

    if (!b.push(uci)) return false;

    const check = b.isCheck();
    this.moves = [
      ...this.moves,
      { ply: this.moves.length + 1, uci, color, piece, captured, check },
    ];
    this.lastMove = mv.from === mv.to ? null : [uciToKey(mv.from), uciToKey(mv.to)];
    this.hint = null;
    this.refresh();

    if (opts.sound !== false) {
      playSound(this.result ? 'end' : check ? 'check' : captured ? 'capture' : 'move');
    }
    return true;
  }

  /** Play a move (common entry for human/AI — a new move discards the redo stack). */
  move(uci: string, byAi = false): boolean {
    if (!this.applyMove(uci)) return false;
    this.redoStack = [];
    this.autosave();
    if (!byAi) this.maybeAiMove();
    if (this.analysisOn) this.restartAnalysis();
    return true;
  }

  /** Pass — find and play the stay-in-place UCI move. */
  pass(): void {
    const b = this.board;
    if (!b || !this.canPass || this.result) return;
    const legal = b.legalMoves().trim().split(/\s+/);
    const passMove = legal.find(u => {
      const mv = parseUci(u);
      return mv !== null && mv.from === mv.to;
    });
    if (passMove) this.move(passMove);
  }

  /** Start a search if it is the AI's turn. */
  private maybeAiMove(): void {
    if (this.mode !== 'ai' || this.result || this.turn !== this.aiColor || !this.engineReady) return;
    const mySeq = this.seq;
    this.thinking = true;
    void engine
      .search(this.startFen, this.movesUci, this.aiMovetime)
      .then(r => {
        if (mySeq !== this.seq || this.phase !== 'play') return;
        this.thinking = false;
        if (r.best) this.move(r.best, true);
      })
      .catch(() => {
        this.thinking = false;
      });
  }

  /** AI hint — show the best move in the current position as an arrow. */
  async requestHint(): Promise<void> {
    if (!this.engineReady || this.result || this.thinking) return;
    const mySeq = this.seq;
    this.thinking = true;
    try {
      const r = await engine.search(this.startFen, this.movesUci, this.aiMovetime);
      if (mySeq !== this.seq) return;
      if (r.best) {
        const mv = parseUci(r.best);
        if (mv && mv.from !== mv.to) this.hint = [uciToKey(mv.from), uciToKey(mv.to)];
      }
    } finally {
      if (mySeq === this.seq) this.thinking = false;
      if (this.analysisOn) this.restartAnalysis();
    }
  }

  /** Undo — in AI mode revert 1-2 plies so it is the human's turn. Undone moves go to the redo stack. */
  undo(): void {
    const b = this.board;
    if (!b || this.moves.length === 0) return;
    this.seq++; // invalidate any in-flight AI search
    void engine.stopSearch();
    this.thinking = false;

    let n = 1;
    if (this.mode === 'ai' && this.turn === this.humanColor && this.moves.length >= 2) n = 2;
    n = Math.min(n, this.moves.length);
    const removed = this.moves.slice(-n).map(m => m.uci);
    for (let i = 0; i < n; i++) b.pop();
    this.moves = this.moves.slice(0, -n);
    this.redoStack = [...removed, ...this.redoStack];

    const last = this.moves[this.moves.length - 1];
    const mv = last ? parseUci(last.uci) : null;
    this.lastMove = mv && mv.from !== mv.to ? [uciToKey(mv.from), uciToKey(mv.to)] : null;
    this.result = null;
    this.resigned = false;
    this.hint = null;
    this.refresh();
    this.autosave();
    if (this.analysisOn) this.restartAnalysis();
  }

  /** Redo — replay undone moves. In AI mode, 2 plies at a time (my move + AI move). */
  redo(): void {
    if (this.redoStack.length === 0 || this.result) return;
    this.seq++;
    void engine.stopSearch();
    this.thinking = false;

    const n = this.mode === 'ai' && this.redoStack.length >= 2 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const uci = this.redoStack[0];
      if (!uci) break;
      if (!this.applyMove(uci)) break;
      this.redoStack = this.redoStack.slice(1);
    }
    this.autosave();
    if (this.analysisOn) this.restartAnalysis();
  }

  /** Toggle analysis — go infinite search. */
  toggleAnalysis(): void {
    this.analysisOn = !this.analysisOn;
    if (this.analysisOn) this.restartAnalysis();
    else {
      void engine.stopSearch();
      this.evalInfo = null;
      this.evalPv = '';
    }
  }

  private restartAnalysis(): void {
    if (!this.analysisOn || !this.engineReady || this.result || this.thinking) return;
    const mySeq = this.seq;
    const ffish = this.ffishMod;
    void engine.search(this.startFen, this.movesUci, null, info => {
      if (mySeq !== this.seq || !this.analysisOn) return;
      this.evalInfo = info;
      if (info.pv.length && this.board && ffish) {
        try {
          this.evalPv = this.board.variationSan(info.pv.slice(0, 8).join(' '), ffish.Notation.JANGGI, false);
        } catch {
          this.evalPv = info.pv.slice(0, 8).join(' ');
        }
      }
    });
  }

  /** Convert the side-to-move cp score to Cho (white) perspective. */
  evalForCho(): { cp?: number; mate?: number } | null {
    const i = this.evalInfo;
    if (!i) return null;
    const sign = this.turn === 'w' ? 1 : -1;
    if (i.mate !== undefined) return { mate: i.mate * sign };
    if (i.cp !== undefined) return { cp: i.cp * sign };
    return null;
  }

  /** Resign — when the human resigns, the opponent wins. */
  resign(): void {
    if (this.result) return;
    this.seq++;
    void engine.stopSearch();
    this.thinking = false;
    const loser = this.mode === 'ai' ? this.humanColor : this.turn;
    this.result = loser === 'w' ? '0-1' : '1-0';
    this.resigned = true;
    this.autosave();
    playSound('end');
  }

  /** Open the new-game options overlay — the game underneath stays intact. */
  newGame(): void {
    this.overlay = 'setup';
  }

  /** Open the board editor overlay. */
  openEditor(): void {
    this.overlay = 'edit';
  }

  closeOverlay(): void {
    this.overlay = null;
  }
}

export const game = new GameState();
