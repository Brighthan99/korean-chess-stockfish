// 대국 상태 컨트롤러 (Svelte 5 runes). 규칙 판정은 ffish, AI는 engine이 담당한다.
import { initFfish, type FfishModule, type FfishBoard } from './ffish';
import { engine, type SearchInfo } from './engine';
import { buildStartFen, type SetupId } from './setups';
import { materialScore, fenBoard, kingSquare, HAN_DUM } from './rules';
import { parseUci, uciToKey } from './notation';
import { playSound } from './sound';
import { saveGame, loadSavedGame, type SavedGame } from './storage';
import { saveNnue, loadNnue, deleteNnue, isValidNnueFile } from './nnue';

export type Mode = 'ai' | 'manual';
export type Ruleset = 'janggi' | 'janggitraditional' | 'janggimodern' | 'janggicasual';

// 표기는 렌더링 시 locale에 따라 생성하므로 메타데이터만 저장한다.
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
  humanColor: 'w' | 'b'; // mode === 'ai'일 때 사람이 두는 쪽
  aiMovetime: number;
  ruleset: Ruleset;
  /** 한 후수 덤. 기본 차림은 1.5, 자유 배치는 사용자 지정. (기획서 §5.4) */
  dum: number;
}

export interface SetupChoice extends GameConfig {
  choSetup: SetupId;
  hanSetup: SetupId;
  firstMover: 'w' | 'b';
}

class GameState {
  phase = $state<'boot' | 'play'>('boot');
  /** 대국 화면 위에 뜨는 레이오버: 새 대국 옵션 / 보드 에디터 */
  overlay = $state<'setup' | 'edit' | null>(null);

  // 설정
  mode = $state<Mode>('ai');
  humanColor = $state<'w' | 'b'>('w');
  aiMovetime = $state(1000);
  ruleset = $state<Ruleset>('janggi');
  dum = $state(HAN_DUM);

  // 대국 상태
  startFen = $state('');
  moves = $state<MoveRecord[]>([]);
  redoStack = $state<string[]>([]); // 물린 수 (재생 순서대로)
  boardFen = $state('');
  turn = $state<'w' | 'b'>('w');
  lastMove = $state<[string, string] | null>(null); // cg 키
  checkKey = $state<string | null>(null); // 장군 상태의 왕 위치 (cg 키)
  bikjang = $state(false);
  canPass = $state(false);
  result = $state<string | null>(null); // '1-0' | '0-1' | '1/2-1/2'
  resigned = $state(false);
  score = $state({ cho: 72, han: 72 + HAN_DUM });
  dests = $state<Map<string, string[]>>(new Map());

  // 엔진 상태
  engineReady = $state(false);
  engineError = $state<string | null>(null);
  thinking = $state(false);

  // NNUE (강한 AI — 사용자 업로드 방식)
  nnueName = $state<string | null>(null); // IndexedDB에 저장된 넷 파일명
  nnueActive = $state(false);
  nnueBusy = $state(false);
  nnueError = $state<string | null>(null); // i18n 키
  hint = $state<[string, string] | null>(null); // cg 키
  analysisOn = $state(false);
  evalInfo = $state<SearchInfo | null>(null);
  evalPv = $state('');

  private ffishMod: FfishModule | null = null;
  private board: FfishBoard | null = null;
  private seq = 0; // 물리기/새 대국 시 진행 중 AI 응답을 무효화

  /** ffish 로드 (앱 시작 시 1회). */
  async init(): Promise<void> {
    this.ffishMod = await initFfish();
  }

  get ffish(): FfishModule | null {
    return this.ffishMod;
  }

  /** 엔진 로드 (첫 대국 시작 시). 실패해도 수동 대국은 가능. */
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
   * 앱 진입: 끝나지 않은 저장 대국이 있으면 복원, 없으면 기본 옵션으로 즉시 시작.
   * (기본: 양측 안상차림, 초 선수, AI 상대(내가 초), 1초, 대회 규칙, 덤 1.5)
   */
  async autoStart(): Promise<void> {
    await this.init();
    const saved = loadSavedGame();
    if (saved && saved.moves.length > 0 && !saved.result) {
      if (await this.resumeSaved()) {
        void this.initNnue(); // 저장된 NNUE 백그라운드 복원
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
      dum: HAN_DUM,
    });
    void this.initNnue(); // 저장된 NNUE 백그라운드 복원
  }

  /** 저장된 NNUE 복원 — 앱 시작 시 호출 (이전에 켜져 있었으면 자동 적용). */
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

  /** 사용자가 선택한 .nnue 파일 등록 + 즉시 적용. */
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

  /** 강한 AI 켜기/끄기. */
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

  /** 저장된 넷 삭제. */
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

  /** 차림 선택으로 대국 시작. */
  async startGame(cfg: SetupChoice): Promise<void> {
    await this.begin(buildStartFen(cfg.choSetup, cfg.hanSetup, cfg.firstMover), cfg);
  }

  /** 임의 FEN(에디터/불러오기)으로 대국 시작. */
  async startFromFen(fen: string, cfg: GameConfig): Promise<void> {
    await this.begin(fen, cfg);
  }

  /** 기보 불러오기 — 시작 FEN + 수순 재생 후 이어두기 가능 상태로. */
  async loadGame(fen: string, movesUci: string[], cfg: GameConfig): Promise<void> {
    await this.begin(fen, cfg, { silent: true });
    for (const uci of movesUci) {
      if (!this.applyMove(uci, { sound: false })) break;
    }
    this.autosave();
    this.maybeAiMove();
    if (this.analysisOn) this.restartAnalysis();
  }

  /** localStorage에 저장된 대국 이어두기. */
  async resumeSaved(): Promise<boolean> {
    const saved = loadSavedGame();
    if (!saved) return false;
    await this.loadGame(saved.fen, saved.moves, {
      mode: saved.mode,
      humanColor: saved.humanColor,
      aiMovetime: saved.aiMovetime,
      ruleset: saved.ruleset,
      dum: saved.dum,
    });
    return true;
  }

  private async begin(fen: string, cfg: GameConfig, opts: { silent?: boolean } = {}): Promise<void> {
    if (!this.ffishMod) await this.init();
    this.mode = cfg.mode;
    this.humanColor = cfg.humanColor;
    this.aiMovetime = cfg.aiMovetime;
    this.ruleset = cfg.ruleset;
    this.dum = cfg.dum;

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
    this.overlay = null; // 대국이 시작되면 레이오버 닫기
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
      dum: this.dum,
      result: this.result,
      ts: Date.now(),
    };
    saveGame(data);
  }

  /** 보드에서 파생되는 상태를 다시 계산한다. */
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
          canPass = true; // 한수쉼은 버튼으로 제공
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
    this.score = { cho: mat.cho, han: mat.han + this.dum };

    if (b.isGameOver()) {
      this.result = b.result();
    } else if (!legal) {
      // 합법수 없음 = 둘 수 없는 쪽의 패배 (외통)
      this.result = this.turn === 'w' ? '0-1' : '1-0';
    }
  }

  /** 수 적용 코어 (redo/불러오기 포함 공통 경로 — AI 트리거·redo 초기화 없음). */
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

  /** 수를 둔다 (사람/AI 공통 진입점 — 새 수이므로 redo 스택은 버린다). */
  move(uci: string, byAi = false): boolean {
    if (!this.applyMove(uci)) return false;
    this.redoStack = [];
    this.autosave();
    if (!byAi) this.maybeAiMove();
    if (this.analysisOn) this.restartAnalysis();
    return true;
  }

  /** 한수쉼 — 제자리 이동 UCI 수를 찾아 둔다. */
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

  /** AI 차례면 탐색을 시작한다. */
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

  /** AI 추천 수 — 현재 국면 최선수를 화살표로 표시. */
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

  /** 물리기 — AI 모드에서는 사람 차례가 되도록 1~2수 취소. 물린 수는 redo 스택으로. */
  undo(): void {
    const b = this.board;
    if (!b || this.moves.length === 0) return;
    this.seq++; // 진행 중 AI 탐색 무효화
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

  /** 앞으로 — 물린 수 재생. AI 모드에서는 (내 수 + AI 수) 2수씩. */
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

  /** 형세판단 토글 — go infinite 분석. */
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

  /** 수(手)를 둘 차례 기준 cp 점수를 초(백) 기준으로 변환. */
  evalForCho(): { cp?: number; mate?: number } | null {
    const i = this.evalInfo;
    if (!i) return null;
    const sign = this.turn === 'w' ? 1 : -1;
    if (i.mate !== undefined) return { mate: i.mate * sign };
    if (i.cp !== undefined) return { cp: i.cp * sign };
    return null;
  }

  /** 기권 — 사람이 기권하면 상대 승. */
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

  /** 새 대국 옵션 레이오버 열기 — 밑의 대국은 그대로 유지된다. */
  newGame(): void {
    this.overlay = 'setup';
  }

  /** 보드 에디터 레이오버 열기. */
  openEditor(): void {
    this.overlay = 'edit';
  }

  closeOverlay(): void {
    this.overlay = null;
  }
}

export const game = new GameState();
