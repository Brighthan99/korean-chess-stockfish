// Fairy-Stockfish WASM 엔진 래퍼. UCI 텍스트로 통신한다. (기획서 §3.2)
// /engine/stockfish.js 는 클래식 스크립트로 로드되어 전역 Stockfish 팩토리를 만든다.
// pthread 워커(stockfish.worker.js)와 wasm은 스크립트 위치 기준 상대 경로로 로드된다.

export interface SearchInfo {
  depth: number;
  /** 수(手)를 둘 차례 기준 centipawn 점수 */
  cp?: number;
  /** 외통까지 수(手) 수. 양수 = 두는 쪽이 이김 */
  mate?: number;
  pv: string[];
}

export interface SearchResult {
  best: string | null; // '(none)'이면 null
  info: SearchInfo | null;
}

type LineHandler = (line: string) => void;

function parseInfo(line: string): SearchInfo | null {
  const depth = /\bdepth (\d+)/.exec(line);
  const score = /\bscore (cp|mate) (-?\d+)/.exec(line);
  const pv = / pv (.+)$/.exec(line);
  if (!depth || !score) return null;
  const info: SearchInfo = { depth: Number(depth[1]), pv: pv ? pv[1]!.trim().split(/\s+/) : [] };
  if (score[1] === 'cp') info.cp = Number(score[2]);
  else info.mate = Number(score[2]);
  return info;
}

export class Engine {
  private sf: StockfishInstance | null = null;
  private handlers = new Set<LineHandler>();
  private initPromise: Promise<void> | null = null;
  private searchHandler: LineHandler | null = null;
  private searching = false;
  private variant = '';

  get ready(): boolean {
    return this.sf !== null;
  }

  init(): Promise<void> {
    if (!this.initPromise) this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    // 에러 메시지는 i18n 키로 던진다 — UI에서 t()로 번역 (미등록 키는 그대로 표시됨)
    if (typeof SharedArrayBuffer === 'undefined') {
      throw new Error('error.nosab');
    }
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/engine/stockfish.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('error.engineLoad'));
      document.head.appendChild(s);
    });
    const factory = window.Stockfish;
    if (!factory) throw new Error('error.engineFactory');
    this.sf = await factory();
    this.sf.addMessageListener(line => {
      for (const h of [...this.handlers]) h(line);
    });
    await this.request('uci', l => l === 'uciok');
    await this.isReady();
  }

  private on(h: LineHandler): void {
    this.handlers.add(h);
  }

  private off(h: LineHandler): void {
    this.handlers.delete(h);
  }

  private send(cmd: string): void {
    this.sf?.postMessage(cmd);
  }

  /** cmd를 보내고 특정 응답 라인이 올 때까지 기다린다. */
  private request(cmd: string, done: (line: string) => boolean): Promise<void> {
    return new Promise(resolve => {
      const h: LineHandler = line => {
        if (done(line)) {
          this.off(h);
          resolve();
        }
      };
      this.on(h);
      this.send(cmd);
    });
  }

  private isReady(): Promise<void> {
    return this.request('isready', l => l === 'readyok');
  }

  /**
   * NNUE 넷 적용 — WASM 가상 파일시스템에 기록 후 EvalFile 지정.
   * 파일명이 variant 감지에 쓰이므로 janggi*로 시작해야 한다.
   */
  async setNnue(name: string, bytes: Uint8Array): Promise<void> {
    await this.init();
    await this.stopSearch();
    const path = `/${name}`;
    this.sf!.FS.writeFile(path, bytes);
    this.send(`setoption name EvalFile value ${path}`);
    this.send('setoption name Use NNUE value true');
    await this.isReady();
  }

  /** NNUE 비활성화 — 클래식 평가로 복귀. */
  async disableNnue(): Promise<void> {
    if (!this.sf) return;
    await this.stopSearch();
    this.send('setoption name Use NNUE value false');
    await this.isReady();
  }

  /** 새 대국 준비: 룰셋(variant) 설정 + ucinewgame. */
  async newGame(variant: string): Promise<void> {
    await this.init();
    await this.stopSearch();
    if (this.variant !== variant) {
      this.send(`setoption name UCI_Variant value ${variant}`);
      this.variant = variant;
    }
    this.send('ucinewgame');
    await this.isReady();
  }

  private position(fen: string, moves: string[]): void {
    this.send(`position fen ${fen}${moves.length ? ` moves ${moves.join(' ')}` : ''}`);
  }

  /**
   * 탐색 시작. movetimeMs가 있으면 시간 제한, 없으면 infinite(분석 모드).
   * bestmove가 나오면 resolve. infinite는 stopSearch() 호출 시 종료된다.
   */
  search(fen: string, moves: string[], movetimeMs: number | null, onInfo?: (i: SearchInfo) => void): Promise<SearchResult> {
    return new Promise((resolve, reject) => {
      if (!this.sf) {
        reject(new Error('error.engineNotReady'));
        return;
      }
      void this.stopSearch().then(() => {
        this.position(fen, moves);
        let last: SearchInfo | null = null;
        const h: LineHandler = line => {
          if (line.startsWith('info ')) {
            const info = parseInfo(line);
            if (info) {
              last = info;
              onInfo?.(info);
            }
          } else if (line.startsWith('bestmove')) {
            this.off(h);
            this.searchHandler = null;
            this.searching = false;
            const best = line.split(/\s+/)[1] ?? null;
            resolve({ best: best === '(none)' ? null : best, info: last });
          }
        };
        this.on(h);
        this.searchHandler = h;
        this.searching = true;
        this.send(movetimeMs === null ? 'go infinite' : `go movetime ${movetimeMs}`);
      });
    });
  }

  /** 진행 중인 탐색을 멈추고 bestmove 수신까지 기다린다. */
  async stopSearch(): Promise<void> {
    if (!this.searching || !this.sf) return;
    await new Promise<void>(resolve => {
      const prev = this.searchHandler;
      if (!prev) {
        this.searching = false;
        resolve();
        return;
      }
      const watcher: LineHandler = line => {
        if (line.startsWith('bestmove')) {
          this.off(watcher);
          resolve();
        }
      };
      this.on(watcher);
      this.send('stop');
    });
    this.searching = false;
  }
}

export const engine = new Engine();
