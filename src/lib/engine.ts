// Fairy-Stockfish WASM engine wrapper. Communicates via UCI text. (plan §3.2)
// /engine/stockfish.js is loaded as a classic script and creates the global Stockfish factory.
// The pthread worker (stockfish.worker.js) and wasm are loaded via paths relative to the script location.

export interface SearchInfo {
  depth: number;
  /** centipawn score from the side to move's perspective */
  cp?: number;
  /** moves until mate. Positive = side to move wins */
  mate?: number;
  pv: string[];
}

export interface SearchResult {
  best: string | null; // null if '(none)'
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
    // Error messages are thrown as i18n keys — translated with t() in the UI (unknown keys shown as-is)
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

  /** Send cmd and wait until the matching response line arrives. */
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
   * Apply an NNUE net — write it to the WASM virtual filesystem, then set EvalFile.
   * The filename is used for variant detection, so it must start with janggi*.
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

  /** Disable NNUE — fall back to classical evaluation. */
  async disableNnue(): Promise<void> {
    if (!this.sf) return;
    await this.stopSearch();
    this.send('setoption name Use NNUE value false');
    await this.isReady();
  }

  /** Prepare a new game: set the ruleset (variant) + ucinewgame. */
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
   * Start a search. Time-limited if movetimeMs is given, otherwise infinite (analysis mode).
   * Resolves on bestmove. Infinite search ends when stopSearch() is called.
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

  /** Stop the running search and wait for the bestmove reply. */
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
