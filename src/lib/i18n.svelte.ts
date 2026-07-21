// 다국어(i18n) — 한국어/영어. locale은 Svelte 5 runes 반응형 상태라
// 템플릿/derived에서 t()를 호출하면 언어 전환 시 자동으로 다시 렌더링된다.

export type Locale = 'ko' | 'en';

const MESSAGES: Record<string, Record<Locale, string>> = {
  // 앱 공통
  'app.name': { ko: '한국 장기', en: 'Janggi' },
  'app.subtitle': { ko: 'Korean Chess', en: 'Korean Chess' },
  'app.title': { ko: '한국 장기 — Korean Chess', en: 'Janggi — Korean Chess' },
  'loading.ffish': { ko: '규칙 엔진(ffish) 로드 중…', en: 'Loading rules engine (ffish)…' },
  'loading.failed': { ko: '로드 실패:', en: 'Failed to load:' },
  'footer.pieces': { ko: '기물·장기판:', en: 'Pieces & board:' },
  'footer.engine': { ko: '엔진:', en: 'Engine:' },
  'footer.sourcePre': { ko: '이 사이트의', en: "This site's" },
  'footer.sourceLink': { ko: '소스 코드', en: 'source code' },
  'footer.sourcePost': { ko: '는 GPL-3.0으로 공개됩니다', en: ' is published under GPL-3.0' },

  // 차림 선택
  'setup.choSetup': { ko: '초 차림', en: 'Cho (Blue) setup' },
  'setup.hanSetup': { ko: '한 차림', en: 'Han (Red) setup' },
  'setup.hanSeat': { ko: '(한 자리 기준)', en: "(from Han's side)" },
  'setup.name.inner': { ko: '안상차림', en: 'Inner Elephants' },
  'setup.name.left': { ko: '왼상차림', en: 'Left Elephant' },
  'setup.name.right': { ko: '오른상차림', en: 'Right Elephant' },
  'setup.name.outer': { ko: '바깥상차림', en: 'Outer Elephants' },
  'setup.desc.inner': { ko: '원앙마 · 양귀상 포진', en: 'Wonangma / Yanggwisang opening' },
  'setup.desc.left': { ko: '귀마 포진', en: 'Gwima opening' },
  'setup.desc.right': { ko: '귀마 포진', en: 'Gwima opening' },
  'setup.desc.outer': { ko: '양귀마 포진', en: 'Yanggwima opening' },
  'setup.mode': { ko: '대국 방식', en: 'Game mode' },
  'setup.mode.aiCho': { ko: 'AI와 대국 — 내가 초', en: 'vs AI — I play Cho' },
  'setup.mode.aiHan': { ko: 'AI와 대국 — 내가 한', en: 'vs AI — I play Han' },
  'setup.mode.manual': { ko: '2인 수동 대국', en: 'Two-player local' },
  'setup.firstMover': { ko: '선수(先手)', en: 'First move' },
  'setup.first.cho': { ko: '초 선수 (기본)', en: 'Cho first (default)' },
  'setup.first.han': { ko: '한 선수', en: 'Han first' },
  'setup.aiTime': { ko: 'AI 사고 시간', en: 'AI thinking time' },
  'setup.time.fast': { ko: '빠름 0.3초', en: 'Fast 0.3s' },
  'setup.time.normal': { ko: '보통 1초', en: 'Normal 1s' },
  'setup.time.deep': { ko: '깊게 3초', en: 'Deep 3s' },
  'setup.rules': { ko: '규칙', en: 'Rules' },
  'rules.janggi': { ko: '대회 규칙', en: 'Tournament' },
  'rules.janggi.desc': { ko: '빅장 + 점수제', en: 'Bikjang + point counting' },
  'rules.janggitraditional': { ko: '전통 규칙', en: 'Traditional' },
  'rules.janggitraditional.desc': { ko: '빅장 무승부, 점수제 없음', en: 'Bikjang draw, no counting' },
  'rules.janggimodern': { ko: '현대 규칙', en: 'Modern' },
  'rules.janggimodern.desc': { ko: '점수제, 빅장 없음 (카카오 호환)', en: 'Counting, no bikjang (Kakao-compatible)' },
  'rules.janggicasual': { ko: '캐주얼', en: 'Casual' },
  'rules.janggicasual.desc': { ko: '빅장·점수제 없음', en: 'No bikjang, no counting' },
  'setup.scorePreview': { ko: '기본 차림 점수 자동 세팅 —', en: 'Default setup scores —' },
  'setup.scoreCho': { ko: '초 {n}점', en: 'Cho {n}' },
  'setup.scoreHan': { ko: '한 {n}점', en: 'Han {n}' },
  'setup.komiNote': { ko: '(한 후수 덤 +{n})', en: "(Han's komi +{n})" },
  'setup.komiNoteCho': { ko: '(초 덤 +{n})', en: "(Cho's komi +{n})" },
  'setup.komiNoteNone': { ko: '(덤 없음)', en: '(no komi)' },
  'setup.start': { ko: '대국 시작', en: 'Start game' },

  // 대국 패널
  'side.cho': { ko: '초', en: 'Cho' },
  'side.han': { ko: '한', en: 'Han' },
  'status.aiThinking': { ko: 'AI 생각 중…', en: 'AI thinking…' },
  'status.check': { ko: '장군!', en: 'Check!' },
  'status.bikjang': { ko: '빅장', en: 'Bikjang' },
  'status.choTurn': { ko: '초 차례', en: 'Cho to move' },
  'status.hanTurn': { ko: '한 차례', en: 'Han to move' },
  'engine.unavailable': { ko: '엔진 사용 불가', en: 'Engine unavailable' },
  'error.nosab': {
    ko: 'SharedArrayBuffer 미지원 — COOP/COEP 헤더 또는 브라우저 확인 필요',
    en: 'SharedArrayBuffer unavailable — check COOP/COEP headers or browser support',
  },
  'error.engineLoad': { ko: '엔진 스크립트 로드 실패', en: 'Failed to load engine script' },
  'error.engineFactory': { ko: 'Stockfish 팩토리를 찾을 수 없음', en: 'Stockfish factory not found' },
  'eval.choMate': { ko: '초 외통 {n}수', en: 'Cho mates in {n}' },
  'eval.hanMate': { ko: '한 외통 {n}수', en: 'Han mates in {n}' },
  'eval.choAhead': { ko: '초 +{n}', en: 'Cho +{n}' },
  'eval.hanAhead': { ko: '한 +{n}', en: 'Han +{n}' },
  'eval.analyzing': { ko: '분석 중…', en: 'Analyzing…' },
  'btn.undo': { ko: '물리기', en: 'Undo' },
  'btn.pass': { ko: '한수쉼', en: 'Pass' },
  'btn.hint': { ko: 'AI 추천', en: 'AI hint' },
  'btn.analysis': { ko: '형세판단', en: 'Analysis' },
  'btn.resign': { ko: '기권', en: 'Resign' },
  'btn.newGame': { ko: '새 대국', en: 'New game' },
  'btn.soundOn': { ko: '🔇 소리 켜기', en: '🔇 Sound on' },
  'btn.soundOff': { ko: '🔊 소리 끄기', en: '🔊 Sound off' },
  'moves.empty': { ko: '아직 둔 수가 없습니다', en: 'No moves yet' },
  'result.1-0': { ko: '초 승', en: 'Cho wins' },
  'result.0-1': { ko: '한 승', en: 'Han wins' },
  'result.1/2-1/2': { ko: '무승부', en: 'Draw' },
  'result.*': { ko: '진행 중', en: 'In progress' },
  'result.resign': { ko: '(기권)', en: '(resignation)' },
  'btn.redo': { ko: '앞으로', en: 'Redo' },
  'btn.custom': { ko: '커스텀 대국', en: 'Custom game' },
  'btn.flip': { ko: '보드 뒤집기', en: 'Flip board' },
  'modal.close': { ko: '닫기', en: 'Close' },
  'setup.orientation': { ko: '보드 방향', en: 'Board orientation' },
  'orient.cho': { ko: '초 아래', en: 'Cho at bottom' },
  'orient.han': { ko: '한 아래', en: 'Han at bottom' },

  // 보드 에디터
  'setup.editor': { ko: '보드 에디터 (자유 배치)', en: 'Board editor (custom position)' },
  'editor.title': { ko: '보드 에디터', en: 'Board editor' },
  'editor.hint': {
    ko: '기물을 드래그해 옮기고, 팔레트에서 골라 클릭으로 배치하세요. 보드 밖으로 드래그하면 제거됩니다.',
    en: 'Drag pieces to move them; pick from the palette and click a square to place. Drag off the board to remove.',
  },
  'editor.moveMode': { ko: '이동', en: 'Move' },
  'editor.eraser': { ko: '지우개', en: 'Eraser' },
  'editor.reset': { ko: '기본 차림', en: 'Default setup' },
  'editor.clear': { ko: '비우기', en: 'Clear board' },
  'editor.sideToMove': { ko: '먼저 둘 쪽', en: 'Side to move' },
  'editor.apply': { ko: '적용', en: 'Apply' },
  'editor.invalid': {
    ko: '유효하지 않은 배치입니다 (궁 위치·기물 수 확인)',
    en: 'Invalid position (check kings and piece counts)',
  },
  'editor.tooMany': { ko: '{piece}: 진영당 최대 {n}개입니다', en: '{piece}: at most {n} per side' },
  'editor.palaceOnly': {
    ko: '궁과 사는 자기 궁성 안에만 놓을 수 있습니다',
    en: 'The king and advisors must stay inside their own palace',
  },
  'editor.cancel': { ko: '돌아가기', en: 'Back' },
  'setup.komi': { ko: '덤 (후수 보상)', en: 'Komi (Deom)' },
  'komi.sideHan': { ko: '한이 받음 (기본)', en: 'Han (default)' },
  'komi.sideCho': { ko: '초가 받음', en: 'Cho' },
  'komi.none': { ko: '없음', en: 'None' },
  'komi.amount': { ko: '덤 점수', en: 'Komi points' },
  'komi.default': { ko: '1.5 (기본)', en: '1.5 (default)' },
  'komi.custom': { ko: '직접 입력', en: 'Custom' },
  'panel.komi': { ko: '덤', en: 'Komi (Deom)' },

  // 이어두기 / 기보 불러오기 / 내보내기
  'setup.resume': { ko: '이어두기', en: 'Resume' },
  'resume.desc': { ko: '저장된 대국 — {n}수 · {date}', en: 'Saved game — {n} moves · {date}' },
  'import.title': { ko: '기보 불러오기', en: 'Load game record' },
  'import.paste': { ko: '텍스트 붙여넣기', en: 'Paste text' },
  'import.load': { ko: '불러오기', en: 'Load' },
  'import.hint': {
    ko: 'PGN([Variant "Janggi"])과 KJA·장기도사식 .gib 텍스트 지원 (EUC-KR 자동 감지). 위에서 선택한 대국 방식·규칙으로 이어집니다.',
    en: 'Supports PGN ([Variant "Janggi"]) and KJA/JanggiDosa-style .gib (EUC-KR auto-detected). Continues with the mode & rules selected above.',
  },
  'import.empty': { ko: '내용이 비어 있습니다', en: 'Empty input' },
  'import.notJanggi': { ko: '장기 기보가 아닙니다 (Variant 헤더 확인)', en: 'Not a janggi record (check Variant header)' },
  'import.error': { ko: '기보를 해석할 수 없습니다', en: 'Could not parse the record' },
  'import.badMove': { ko: '수순 오류 ({n}번째 수)', en: 'Invalid move (ply {n})' },
  'export.fen': { ko: 'FEN 복사', en: 'Copy FEN' },
  'export.copied': { ko: '복사됨!', en: 'Copied!' },
  'export.pgn': { ko: 'PGN 저장', en: 'Save PGN' },
  'export.gib': { ko: '.gib 저장', en: 'Save .gib' },

  // NNUE (강한 AI — 사용자 업로드)
  'nnue.title': { ko: '강한 AI (NNUE)', en: 'Strong AI (NNUE)' },
  'nnue.desc': {
    ko: '공식 페이지에서 장기용 NNUE 파일(약 11MB, janggi-….nnue)을 내려받아 선택하면 AI가 크게 강해집니다 (+1128 Elo). 파일은 이 브라우저에 저장되어 다음 방문부터 자동 적용됩니다.',
    en: 'Download the janggi NNUE file (~11MB, janggi-….nnue) from the official page and select it to make the AI much stronger (+1128 Elo). It is stored in this browser and applied automatically on future visits.',
  },
  'nnue.choose': { ko: 'NNUE 파일 선택', en: 'Choose NNUE file' },
  'nnue.download': { ko: '공식 다운로드 페이지', en: 'Official download page' },
  'nnue.on': { ko: '켜짐', en: 'On' },
  'nnue.off': { ko: '꺼짐', en: 'Off' },
  'nnue.delete': { ko: '삭제', en: 'Delete' },
  'nnue.loading': { ko: '적용 중…', en: 'Applying…' },
  'nnue.invalidFile': {
    ko: 'janggi로 시작하는 .nnue 파일을 선택하세요',
    en: 'Select a .nnue file whose name starts with "janggi"',
  },
  'nnue.error': { ko: 'NNUE 적용에 실패했습니다', en: 'Failed to apply NNUE' },
};

function detectLocale(): Locale {
  const saved = localStorage.getItem('kc-lang');
  if (saved === 'ko' || saved === 'en') return saved;
  return navigator.language?.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

class I18n {
  locale = $state<Locale>(detectLocale());

  set(l: Locale): void {
    this.locale = l;
    localStorage.setItem('kc-lang', l);
  }

  t(key: string, params?: Record<string, string | number>): string {
    const entry = MESSAGES[key];
    let s = entry ? entry[this.locale] : key; // 미등록 키는 키/원문 그대로 노출
    if (params) {
      for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
    }
    return s;
  }
}

export const i18n = new I18n();
export const t = (key: string, params?: Record<string, string | number>): string => i18n.t(key, params);
