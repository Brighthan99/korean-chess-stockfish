<script lang="ts">
  import { onMount } from 'svelte';
  import { Chessground } from 'chessgroundx/chessground.js';
  import type { Api } from 'chessgroundx/api.js';
  import type * as cg from 'chessgroundx/types.js';
  import { game, type Ruleset } from '../lib/game.svelte';
  import { DEFAULT_START_FEN } from '../lib/setups';
  import { HAN_DUM, PIECE_LIMITS, isPalaceSquare, findEditorViolation, fenBoard, type EditorViolation } from '../lib/rules';
  import { keyToUci, pieceKo, pieceEn } from '../lib/notation';
  import { i18n, t } from '../lib/i18n.svelte';

  // 팔레트 브러시: null = 드래그 이동 모드
  type Brush = { color: cg.Color; role: cg.Role } | 'erase' | null;

  const ROLES: { role: cg.Role; letter: string }[] = [
    { role: 'k-piece' as cg.Role, letter: 'k' },
    { role: 'r-piece' as cg.Role, letter: 'r' },
    { role: 'c-piece' as cg.Role, letter: 'c' },
    { role: 'n-piece' as cg.Role, letter: 'n' },
    { role: 'b-piece' as cg.Role, letter: 'b' },
    { role: 'a-piece' as cg.Role, letter: 'a' },
    { role: 'p-piece' as cg.Role, letter: 'p' },
  ];

  // 대국 중에 열면 현재 국면에서 편집을 시작한다 (없으면 기본 차림)
  const initialBoard = (game.boardFen || DEFAULT_START_FEN).split(' ')[0] ?? '';

  let el: HTMLElement;
  let api: Api | undefined;
  let brush = $state<Brush>(null);
  let sideToMove = $state<'w' | 'b'>(game.boardFen ? game.turn : 'w');
  let fenText = $state(initialBoard);
  let invalid = $state(false);
  let warning = $state<string | null>(null);
  // 되돌리기용 — 항상 제약을 만족하는 마지막 배치
  let lastValid = initialBoard;

  function violationText(v: EditorViolation): string {
    const name = i18n.locale === 'ko' ? pieceKo(v.piece) : pieceEn(v.piece);
    return v.type === 'palace' ? t('editor.palaceOnly') : t('editor.tooMany', { piece: name, n: v.limit ?? 0 });
  }

  // 대국 옵션
  let playMode = $state<'ai-cho' | 'ai-han' | 'manual'>('ai-cho');
  let aiMovetime = $state(1000);
  let ruleset = $state<Ruleset>('janggi');
  let dumChoice = $state<'none' | 'default' | 'custom'>('none'); // 임의 배치 → 덤 기본 없음 (기획서 §5.4)
  let dumCustom = $state(1.5);

  const RULESET_IDS: Ruleset[] = ['janggi', 'janggitraditional', 'janggimodern', 'janggicasual'];

  /** 보드 상태를 읽어 제약 검사 — 위반이면 마지막 유효 배치로 되돌린다 (드래그 경로 방어). */
  function syncFromBoard(): void {
    if (!api) return;
    const fen = api.getFen();
    const v = findEditorViolation(fen);
    if (v) {
      api.set({ fen: lastValid });
      warning = violationText(v);
      return;
    }
    lastValid = fen;
    fenText = fen;
    invalid = false;
    warning = null;
  }

  /** 팔레트 배치 사전 검사: 기물 수 상한 + 궁·사의 궁성 제한. */
  function canPlace(color: cg.Color, letter: string, key: cg.Key): boolean {
    const sq = keyToUci(key);
    const side: 'w' | 'b' = color === 'white' ? 'w' : 'b';
    const cased = side === 'w' ? letter.toUpperCase() : letter;
    if ((letter === 'k' || letter === 'a') && !isPalaceSquare(sq, side)) {
      warning = t('editor.palaceOnly');
      return false;
    }
    const board = fenBoard(api?.getFen() ?? '');
    let count = 0;
    for (const l of board.values()) if (l === cased) count++;
    if (board.get(sq) === cased) count--; // 같은 기물 위에 겹쳐 놓으면 개수 불변
    const limit = PIECE_LIMITS[letter] ?? 99;
    if (count + 1 > limit) {
      warning = t('editor.tooMany', { piece: i18n.locale === 'ko' ? pieceKo(cased) : pieceEn(cased), n: limit });
      return false;
    }
    return true;
  }

  onMount(() => {
    api = Chessground(el, {
      fen: fenText,
      orientation: 'white',
      coordinates: false,
      dimensions: { width: 9, height: 10 },
      animation: { enabled: true, duration: 120 },
      highlight: { lastMove: false, check: false },
      premovable: { enabled: false },
      movable: { free: true, color: 'both', showDests: false },
      draggable: { enabled: true, deleteOnDropOff: true, showGhost: true },
      selectable: { enabled: false },
      drawable: { enabled: false },
      events: {
        change: syncFromBoard,
        select: (key: cg.Key) => {
          if (!api || brush === null) return;
          if (brush === 'erase') {
            api.setPieces(new Map([[key, undefined]]) as cg.PiecesDiff);
          } else {
            const letter = brush.role[0] ?? '';
            if (!canPlace(brush.color, letter, key)) {
              api.selectSquare(null);
              return;
            }
            api.setPieces(new Map([[key, { role: brush.role, color: brush.color }]]) as cg.PiecesDiff);
          }
          api.selectSquare(null); // 내장 선택 상태 제거 (클릭-이동 방지)
          syncFromBoard();
        },
      },
    });
    return () => api?.destroy();
  });

  // 브러시 상태에 따라 클릭/드래그 모드 전환.
  // 브러시 모드에서는 chessground 내장 클릭-이동(free move)이 배치 핸들러와
  // 충돌하지 않도록 movable.free를 꺼서 이동을 완전히 차단한다.
  $effect(() => {
    if (!api) return;
    if (brush === null) {
      api.set({ draggable: { enabled: true }, selectable: { enabled: false }, movable: { free: true } });
    } else {
      api.set({ draggable: { enabled: false }, selectable: { enabled: true }, movable: { free: false } });
    }
    api.selectSquare(null);
    warning = null;
  });

  function setBoardFen(fen: string): void {
    api?.set({ fen });
    syncFromBoard();
  }

  function applyFenText(): void {
    setBoardFen(fenText.split(' ')[0] ?? '');
  }

  function fullFen(): string {
    return `${api?.getFen() ?? fenText} ${sideToMove} - - 0 1`;
  }

  function dum(): number {
    if (dumChoice === 'none') return 0;
    if (dumChoice === 'default') return HAN_DUM;
    return Number.isFinite(dumCustom) ? dumCustom : 0;
  }

  function start(): void {
    const ffish = game.ffish;
    const fen = fullFen();
    if (ffish && ffish.validateFen(fen, ruleset) !== 1) {
      invalid = true;
      return;
    }
    void game.startFromFen(fen, {
      mode: playMode === 'manual' ? 'manual' : 'ai',
      humanColor: playMode === 'ai-han' ? 'b' : 'w',
      aiMovetime,
      ruleset,
      dum: dum(),
    });
  }
</script>

<div class="editor janggi kakao">
  <h2>{t('editor.title')}</h2>
  <p class="hint">{t('editor.hint')}</p>

  <div class="layout">
    <div class="board-col">
      <div class="board-shell">
        <div class="board" bind:this={el}></div>
      </div>
    </div>

    <div class="side">
      <div class="palette">
        <div class="row">
          <button class="tool" class:active={brush === null} onclick={() => (brush = null)}>{t('editor.moveMode')}</button>
          <button class="tool" class:active={brush === 'erase'} onclick={() => (brush = 'erase')}>{t('editor.eraser')}</button>
        </div>
        <div class="row pieces">
          {#each ROLES as r (r.letter)}
            <button
              class="pbtn"
              aria-label={`cho-${r.letter}`}
              class:active={brush !== null && brush !== 'erase' && brush.color === 'white' && brush.role === r.role}
              onclick={() => (brush = { color: 'white', role: r.role })}
            >
              <piece class="{r.letter}-piece white"></piece>
            </button>
          {/each}
        </div>
        <div class="row pieces">
          {#each ROLES as r (r.letter)}
            <button
              class="pbtn"
              aria-label={`han-${r.letter}`}
              class:active={brush !== null && brush !== 'erase' && brush.color === 'black' && brush.role === r.role}
              onclick={() => (brush = { color: 'black', role: r.role })}
            >
              <piece class="{r.letter}-piece black"></piece>
            </button>
          {/each}
        </div>
        <div class="row">
          <button class="tool" onclick={() => setBoardFen(DEFAULT_START_FEN.split(' ')[0] ?? '')}>{t('editor.reset')}</button>
          <button class="tool" onclick={() => setBoardFen('4k4/9/9/9/9/9/9/9/4K4/9')}>{t('editor.clear')}</button>
        </div>
      </div>

      <div class="opt">
        <span class="opt-label">{t('editor.sideToMove')}</span>
        <div class="seg">
          <button class:active={sideToMove === 'w'} onclick={() => (sideToMove = 'w')}>{t('side.cho')}</button>
          <button class:active={sideToMove === 'b'} onclick={() => (sideToMove = 'b')}>{t('side.han')}</button>
        </div>
      </div>

      <div class="opt fen-row">
        <span class="opt-label">FEN</span>
        <input class="fen" type="text" bind:value={fenText} spellcheck="false" />
        <button class="tool" onclick={applyFenText}>{t('editor.apply')}</button>
      </div>

      <hr />

      <div class="opt">
        <span class="opt-label">{t('setup.mode')}</span>
        <div class="seg">
          <button class:active={playMode === 'ai-cho'} onclick={() => (playMode = 'ai-cho')}>{t('setup.mode.aiCho')}</button>
          <button class:active={playMode === 'ai-han'} onclick={() => (playMode = 'ai-han')}>{t('setup.mode.aiHan')}</button>
          <button class:active={playMode === 'manual'} onclick={() => (playMode = 'manual')}>{t('setup.mode.manual')}</button>
        </div>
      </div>

      {#if playMode !== 'manual'}
        <div class="opt">
          <span class="opt-label">{t('setup.aiTime')}</span>
          <div class="seg">
            <button class:active={aiMovetime === 300} onclick={() => (aiMovetime = 300)}>{t('setup.time.fast')}</button>
            <button class:active={aiMovetime === 1000} onclick={() => (aiMovetime = 1000)}>{t('setup.time.normal')}</button>
            <button class:active={aiMovetime === 3000} onclick={() => (aiMovetime = 3000)}>{t('setup.time.deep')}</button>
          </div>
        </div>
      {/if}

      <div class="opt">
        <span class="opt-label">{t('setup.rules')}</span>
        <div class="seg">
          {#each RULESET_IDS as r (r)}
            <button class:active={ruleset === r} onclick={() => (ruleset = r)} title={t(`rules.${r}.desc`)}>{t(`rules.${r}`)}</button>
          {/each}
        </div>
      </div>

      <!-- 임의 배치는 후수 덤을 알 수 없으므로 직접 지정 (기획서 §5.4) -->
      <div class="opt">
        <span class="opt-label">{t('setup.dum')}</span>
        <div class="seg">
          <button class:active={dumChoice === 'none'} onclick={() => (dumChoice = 'none')}>{t('dum.none')}</button>
          <button class:active={dumChoice === 'default'} onclick={() => (dumChoice = 'default')}>{t('dum.default')}</button>
          <button class:active={dumChoice === 'custom'} onclick={() => (dumChoice = 'custom')}>{t('dum.custom')}</button>
          {#if dumChoice === 'custom'}
            <input class="dum-input" type="number" step="0.5" min="0" bind:value={dumCustom} />
          {/if}
        </div>
      </div>

      {#if warning}
        <p class="invalid">{warning}</p>
      {/if}
      {#if invalid}
        <p class="invalid">{t('editor.invalid')}</p>
      {/if}

      <div class="actions">
        <button class="start" onclick={start}>{t('setup.start')}</button>
        <button class="cancel" onclick={() => game.closeOverlay()}>{t('editor.cancel')}</button>
      </div>
    </div>
  </div>
</div>

<style>
  .editor {
    max-width: 1000px;
    margin: 0 auto;
  }
  h2 {
    margin: 0 0 4px;
    font-size: 18px;
  }
  .hint {
    color: var(--sub);
    font-size: 13px;
    margin: 0 0 14px;
  }
  .layout {
    display: flex;
    gap: 20px;
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .board-col {
    flex: 0 1 480px;
    width: min(92vw, 480px);
  }
  .board-shell {
    width: 100%;
    aspect-ratio: 9 / 10;
    user-select: none;
    -webkit-user-select: none;
  }
  .board {
    width: 100%;
    height: 100%;
  }
  .side {
    flex: 1 1 320px;
    min-width: 300px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .palette {
    display: flex;
    flex-direction: column;
    gap: 6px;
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 10px;
  }
  .row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .pbtn {
    width: 44px;
    height: 44px;
    border: 1.5px solid var(--line);
    border-radius: 8px;
    background: #fff;
    cursor: pointer;
    padding: 3px;
  }
  .pbtn.active {
    border-color: var(--cho);
    background: #eef7f2;
  }
  .pbtn :global(piece) {
    display: block;
    width: 100%;
    height: 100%;
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
  }
  .tool {
    border: 1.5px solid var(--line);
    background: #fff;
    border-radius: 8px;
    padding: 6px 12px;
    font-size: 13.5px;
    cursor: pointer;
  }
  .tool.active {
    border-color: var(--cho);
    background: var(--cho);
    color: #fff;
  }
  .opt {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .opt-label {
    min-width: 88px;
    font-weight: 600;
    font-size: 14px;
  }
  .seg {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
  }
  .seg button {
    border: 1.5px solid var(--line);
    background: #fff;
    border-radius: 8px;
    padding: 6px 10px;
    font-size: 13px;
    cursor: pointer;
  }
  .seg button.active {
    border-color: var(--cho);
    background: var(--cho);
    color: #fff;
  }
  .fen-row {
    flex-wrap: nowrap;
  }
  .fen {
    flex: 1;
    min-width: 0;
    border: 1.5px solid var(--line);
    border-radius: 8px;
    padding: 6px 8px;
    font-family: 'SF Mono', Menlo, monospace;
    font-size: 12px;
  }
  .dum-input {
    width: 70px;
    border: 1.5px solid var(--line);
    border-radius: 8px;
    padding: 5px 8px;
    font-size: 13.5px;
  }
  hr {
    border: none;
    border-top: 1px solid var(--line);
    margin: 2px 0;
  }
  .invalid {
    color: var(--han);
    font-size: 13.5px;
    margin: 0;
  }
  .actions {
    display: flex;
    gap: 8px;
  }
  .start {
    background: var(--cho);
    color: #fff;
    border: none;
    border-radius: 10px;
    padding: 10px 32px;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
  }
  .cancel {
    border: 1.5px solid var(--line);
    background: #fff;
    border-radius: 10px;
    padding: 10px 20px;
    font-size: 14px;
    cursor: pointer;
  }
</style>
