// 기보 import/export. (기획서 §7)
// - PGN: [Variant "Janggi"] + [FEN]/[SetUp], SAN 수순 — ffish로 생성/파싱 (PyChess 호환)
// - .gib: KJA/장기도사 계열 텍스트 — 대괄호 헤더 + 한국식 좌표 수순 (79졸78, 한수쉼)
// - 인코딩: 내보내기는 UTF-8, 불러오기는 UTF-8/EUC-KR 자동 감지 (레거시 .gib은 EUC-KR)
import type { FfishModule, FfishBoard } from './ffish';
import { fenFromAbsolute, fenPattern, KO_TO_ARR, DEFAULT_START_FEN } from './setups';
import { kjaMove, parseUci } from './notation';
import type { MoveRecord } from './game.svelte';

export interface ParsedGame {
  fen: string;
  moves: string[]; // UCI
}

// ---------- 공통 ----------

/** 텍스트 파일 다운로드. */
export function download(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 기보 파일 읽기 — UTF-8 우선, 실패 시 EUC-KR (레거시 .gib). */
export async function readGiboFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('euc-kr').decode(buf);
  }
}

/** 형식 감지: PGN(대괄호 영문 헤더/SAN) vs .gib(한국식). */
export function detectFormat(text: string): 'pgn' | 'gib' {
  if (/\[\s*(Variant|FEN|Event|SetUp)\s+"/i.test(text)) return 'pgn';
  if (/\[(대회명|초대국자|한대국자|초차림|한차림|대국결과|총수)\s+"/.test(text)) return 'gib';
  if (/(졸|병|한수쉼)/.test(text)) return 'gib';
  return 'pgn';
}

function today(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// ---------- PGN ----------

export function toPgn(
  ffish: FfishModule,
  ruleset: string,
  startFen: string,
  moves: MoveRecord[],
  result: string | null,
): string {
  const res = result ?? '*';
  const headers = [
    `[Event "Korean Chess casual game"]`,
    `[Site "${typeof location !== 'undefined' ? location.host || 'local' : 'local'}"]`,
    `[Date "${today().replaceAll('-', '.')}"]`,
    `[Round "-"]`,
    `[White "Cho"]`,
    `[Black "Han"]`,
    `[Result "${res}"]`,
    `[Variant "Janggi"]`,
    `[SetUp "1"]`,
    `[FEN "${startFen}"]`,
  ];
  const b = new ffish.Board(ruleset, startFen);
  let movetext = '';
  try {
    movetext = b.variationSan(moves.map(m => m.uci).join(' '), ffish.Notation.SAN, true);
  } finally {
    b.delete();
  }
  return `${headers.join('\n')}\n\n${movetext} ${res}\n`;
}

export function fromPgn(ffish: FfishModule, text: string): ParsedGame {
  const game = ffish.readGamePGN(text) as {
    headers(item: string): string;
    mainlineMoves(): string;
    delete(): void;
  };
  try {
    const variant = (game.headers('Variant') || 'janggi').toLowerCase().replace(/\s/g, '');
    if (!variant.startsWith('janggi')) throw new Error('import.notJanggi');
    const fen = game.headers('FEN') || ffish.startingFen('janggi');
    const moves = game.mainlineMoves().trim();
    return { fen, moves: moves ? moves.split(/\s+/) : [] };
  } finally {
    game.delete();
  }
}

// ---------- .gib (KJA 스타일) ----------

export interface GibMeta {
  choPlayer: string;
  hanPlayer: string;
}

const GIB_RESULT: Record<string, string> = {
  '1-0': '초 완승',
  '0-1': '한 완승',
  '1/2-1/2': '무승부',
};

export function toGib(startFen: string, moves: MoveRecord[], result: string | null, meta: GibMeta): string {
  const choPattern = fenPattern(startFen, 'cho') ?? '-';
  const hanPattern = fenPattern(startFen, 'han') ?? '-';
  const lines = [
    `[대회명 "Korean Chess"]`,
    `[대국일자 "${today()}"]`,
    `[초대국자 "${meta.choPlayer}"]`,
    `[한대국자 "${meta.hanPlayer}"]`,
    `[초차림 "${choPattern}"]`,
    `[한차림 "${hanPattern}"]`,
    `[총수 "${moves.length}"]`,
  ];
  if (result && GIB_RESULT[result]) lines.push(`[대국결과 "${GIB_RESULT[result]}"]`);
  // 비표준 시작 배치는 FEN 헤더로 보존 (자체 확장 — 레거시 뷰어는 무시)
  if (choPattern === '-' || hanPattern === '-' || !startFen.includes(' w - - 0 1') || startFen !== fenFromPatterns(choPattern, hanPattern)) {
    lines.push(`[FEN "${startFen}"]`);
  }
  const body: string[] = [];
  moves.forEach((m, i) => {
    body.push(`${i + 1}. ${kjaMove(m.uci, m.piece, m.captured, m.check)}`);
  });
  // 5수씩 줄바꿈
  const rows: string[] = [];
  for (let i = 0; i < body.length; i += 5) rows.push(body.slice(i, i + 5).join('  '));
  return `${lines.join('\n')}\n\n${rows.join('\n')}\n`;
}

function fenFromPatterns(choKo: string, hanKo: string): string | null {
  const c = KO_TO_ARR[choKo];
  const h = KO_TO_ARR[hanKo];
  return c && h ? fenFromAbsolute(c, h, 'w') : null;
}

/** KJA 좌표('79') → UCI('i4'). 행 '0' = 10행. */
function kjaSqToUci(rc: string): string | null {
  if (!/^\d\d$/.test(rc)) return null;
  let row = Number(rc[0]);
  if (row === 0) row = 10;
  const col = Number(rc[1]);
  if (col < 1 || col > 9) return null;
  return `${String.fromCharCode(96 + col)}${11 - row}`;
}

const GIB_MOVE = /^(\d\d)(차|포|마|상|사|졸|병|장|궁)(\d\d)/;

export function fromGib(ffish: FfishModule, ruleset: string, text: string): ParsedGame {
  // 헤더
  const headers = new Map<string, string>();
  for (const m of text.matchAll(/\[(\S+)\s+"([^"]*)"\]/g)) headers.set(m[1]!, m[2]!);

  let fen = headers.get('FEN') ?? null;
  if (!fen) {
    const cho = headers.get('초차림');
    const han = headers.get('한차림');
    fen = (cho && han && fenFromPatterns(cho, han)) || DEFAULT_START_FEN;
  }

  // 수순: 헤더 제거 후 토큰화
  const bodyText = text.replace(/\[[^\]]*\]/g, ' ');
  const tokens = bodyText.split(/\s+/).filter(t => t && !/^\d+\.$/.test(t));

  const board: FfishBoard = new ffish.Board(ruleset, fen);
  const moves: string[] = [];
  try {
    for (const raw of tokens) {
      const token = raw.replace(/^\d+\./, ''); // "1.79졸78" 형태 대비
      if (!token) continue;
      if (token.startsWith('한수쉼')) {
        const pass = board
          .legalMoves()
          .trim()
          .split(/\s+/)
          .find(u => {
            const mv = parseUci(u);
            return mv !== null && mv.from === mv.to;
          });
        if (!pass) throw new Error(`import.badMove:${moves.length + 1}`);
        board.push(pass);
        moves.push(pass);
        continue;
      }
      const m = GIB_MOVE.exec(token);
      if (!m) continue; // 결과 표기 등 무관 토큰은 무시
      const from = kjaSqToUci(m[1]!);
      const to = kjaSqToUci(m[3]!);
      if (!from || !to) throw new Error(`import.badMove:${moves.length + 1}`);
      const uci = `${from}${to}`;
      if (!board.push(uci)) throw new Error(`import.badMove:${moves.length + 1}`);
      moves.push(uci);
    }
  } finally {
    board.delete();
  }
  return { fen, moves };
}

// ---------- 통합 ----------

export function parseGibo(ffish: FfishModule, ruleset: string, text: string): ParsedGame {
  const cleaned = text.replace(/^﻿/, '').trim();
  if (!cleaned) throw new Error('import.empty');
  return detectFormat(cleaned) === 'pgn' ? fromPgn(ffish, cleaned) : fromGib(ffish, ruleset, cleaned);
}
