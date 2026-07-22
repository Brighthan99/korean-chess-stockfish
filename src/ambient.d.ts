// ffish-es6 ships ffish.d.ts in the package, but its package.json has no types field,
// so only the parts we need are declared here. (Source: node_modules/ffish-es6/ffish.d.ts)
declare module 'ffish-es6' {
  export interface FfishBoard {
    delete(): void;
    legalMoves(): string;
    legalMovesSan(): string;
    numberLegalMoves(): number;
    push(uciMove: string): boolean;
    pop(): void;
    reset(): void;
    fen(): string;
    setFen(fen: string): void;
    sanMove(uciMove: string, notation?: number): string;
    variationSan(uciMoves: string, notation?: number, moveNumbers?: boolean): string;
    turn(): boolean; // true = white (Cho)
    fullmoveNumber(): number;
    gamePly(): number;
    isGameOver(claimDraw?: boolean): boolean;
    result(claimDraw?: boolean): string;
    checkedPieces(): string;
    isCheck(): boolean;
    isBikjang(): boolean;
    isCapture(uciMove: string): boolean;
    moveStack(): string;
    pushMoves(uciMoves: string): void;
    toString(): string;
    variant(): string;
  }

  export interface FfishModule {
    Board: new (uciVariant?: string, fen?: string, is960?: boolean) => FfishBoard;
    Notation: { DEFAULT: number; SAN: number; LAN: number; JANGGI: number };
    variants(): string;
    startingFen(uciVariant: string): string;
    validateFen(fen: string, uciVariant?: string): number;
    readGamePGN(pgn: string): unknown;
  }

  export interface ModuleOptions {
    locateFile?: (file: string, prefix?: string) => string;
    [key: string]: unknown;
  }

  const Module: (opts?: ModuleOptions) => Promise<FfishModule>;
  export default Module;
}

// stockfish.js from fairy-stockfish-nnue.wasm is a classic script loaded via <script>,
// defining the global Stockfish factory.
interface StockfishInstance {
  postMessage(cmd: string): void;
  addMessageListener(cb: (line: string) => void): void;
  terminate?(): void;
  /** emscripten virtual filesystem — used to write the NNUE net file */
  FS: {
    writeFile(path: string, data: Uint8Array): void;
    unlink(path: string): void;
  };
}

interface Window {
  Stockfish?: (opts?: Record<string, unknown>) => Promise<StockfishInstance>;
}
