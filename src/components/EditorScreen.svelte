<script lang="ts">
  import { onMount } from 'svelte';
  import { Chessground } from 'chessgroundx/chessground.js';
  import { dragNewPiece } from 'chessgroundx/drag.js';
  import { getKeyAtDomPos } from 'chessgroundx/board.js';
  import type { Api } from 'chessgroundx/api.js';
  import type * as cg from 'chessgroundx/types.js';
  import { game, type Ruleset, type KomiSide } from '../lib/game.svelte';
  import { DEFAULT_START_FEN } from '../lib/setups';
  import { HAN_KOMI, PIECE_LIMITS, isPalaceSquare, findEditorViolation, fenBoard, type EditorViolation } from '../lib/rules';
  import { keyToUci, pieceKo, pieceEn } from '../lib/notation';
  import { i18n, t } from '../lib/i18n.svelte';

  // Palette selection (for click-to-place). Drag-move, delete, and drag-add are always active.
  type Brush = { color: cg.Color; role: cg.Role } | null;

  const ROLES: { role: cg.Role; letter: string }[] = [
    { role: 'k-piece' as cg.Role, letter: 'k' },
    { role: 'r-piece' as cg.Role, letter: 'r' },
    { role: 'c-piece' as cg.Role, letter: 'c' },
    { role: 'n-piece' as cg.Role, letter: 'n' },
    { role: 'b-piece' as cg.Role, letter: 'b' },
    { role: 'a-piece' as cg.Role, letter: 'a' },
    { role: 'p-piece' as cg.Role, letter: 'p' },
  ];

  // When opened mid-game, start editing from the current position (default opening setup otherwise)
  const initialBoard = (game.boardFen || DEFAULT_START_FEN).split(' ')[0] ?? '';

  let el: HTMLElement;
  let api: Api | undefined;
  let brush = $state<Brush>(null);
  /** Selected square for keyboard deletion (selected by clicking a piece while the brush is off) */
  let selectedKey = $state<cg.Key | null>(null);
  let fenText = $state(initialBoard);
  let invalid = $state(false);
  let warning = $state<string | null>(null);
  // For reverting — the last placement that satisfies all constraints
  let lastValid = initialBoard;

  function violationText(v: EditorViolation): string {
    const name = i18n.locale === 'ko' ? pieceKo(v.piece) : pieceEn(v.piece);
    return v.type === 'palace' ? t('editor.palaceOnly') : t('editor.tooMany', { piece: name, n: v.limit ?? 0 });
  }

  // ---- Game options (last-used values remembered: kc-editor) ----
  const savedOpts = ((): Record<string, unknown> => {
    try {
      return JSON.parse(localStorage.getItem('kc-editor') ?? '{}') as Record<string, unknown>;
    } catch {
      return {};
    }
  })();
  const pick = <T,>(v: unknown, allowed: readonly T[], dflt: T): T =>
    allowed.includes(v as T) ? (v as T) : dflt;

  const RULESET_IDS: Ruleset[] = ['janggi', 'janggitraditional', 'janggimodern', 'janggicasual'];

  let playMode = $state<'ai-cho' | 'ai-han' | 'manual'>(
    pick(savedOpts.playMode, ['ai-cho', 'ai-han', 'manual'] as const, 'ai-cho'),
  );
  // Remember side to move and board orientation too — fall back to the current game only when no saved value exists
  let sideToMove = $state<'w' | 'b'>(
    pick(savedOpts.sideToMove, ['w', 'b'] as const, game.boardFen ? game.turn : 'w'),
  );
  let orientation = $state<'w' | 'b'>(pick(savedOpts.orientation, ['w', 'b'] as const, game.orientation));
  let aiMovetime = $state(pick(savedOpts.aiMovetime, [300, 1000, 3000] as const, 1000));
  let ruleset = $state<Ruleset>(pick(savedOpts.ruleset, RULESET_IDS, 'janggi'));
  // Initial default: Han receives komi 1.5 (standard). Receiving side and amount are freely changeable (plan §5.4)
  let komiSide = $state<KomiSide>(pick(savedOpts.komiSide, ['han', 'cho', 'none'] as const, 'han'));
  let komiAmount = $state<'default' | 'custom'>(pick(savedOpts.komiAmount, ['default', 'custom'] as const, 'default'));
  let komiCustom = $state(typeof savedOpts.komiCustom === 'number' && savedOpts.komiCustom >= 0 ? savedOpts.komiCustom : 1.5);

  // Options are saved immediately on change — restored as-is next time even without pressing Start
  $effect(() => {
    localStorage.setItem(
      'kc-editor',
      JSON.stringify({ playMode, aiMovetime, ruleset, komiSide, komiAmount, komiCustom, sideToMove, orientation }),
    );
  });

  /** Read the board state and check constraints — on violation, revert to the last valid placement (guards the drag path). */
  function syncFromBoard(): void {
    if (!api) return;
    const fen = api.getFen();
    const v = findEditorViolation(fen);
    if (v) {
      api.set({ fen: lastValid });
      warning = violationText(v);
      return;
    }
    // Clear the warning/selection only when an actual change occurred.
    // (On drop, change/dropNewPiece fire back to back; the second call right
    //  after a violation revert must not wipe the warning we just showed)
    if (fen !== lastValid) {
      warning = null;
      selectedKey = null;
      lastValid = fen;
      fenText = fen;
    }
    invalid = false;
  }

  /** Pre-check for palette placement: piece count limits + palace restriction for king/advisor. */
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
    if (board.get(sq) === cased) count--; // dropping onto the same piece keeps the count unchanged
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
      orientation: orientation === 'b' ? 'black' : 'white',
      coordinates: false,
      dimensions: { width: 9, height: 10 },
      animation: { enabled: true, duration: 120 },
      // Reuse the lastMove highlight as the "selection marker" (chessground's built-in
      // selection can trigger click-to-move, so we avoid it)
      highlight: { lastMove: true, check: false },
      premovable: { enabled: false },
      movable: { free: true, color: 'both', showDests: false },
      draggable: { enabled: true, deleteOnDropOff: true, showGhost: true },
      selectable: { enabled: false },
      drawable: { enabled: false },
      events: {
        change: syncFromBoard,
        // Pieces dropped by dragging from the palette go through the same validation path
        dropNewPiece: () => syncFromBoard(),
      },
    });
    return () => api?.destroy();
  });

  // Apply the board orientation choice
  $effect(() => {
    api?.set({ orientation: orientation === 'b' ? 'black' : 'white' });
  });

  // ---- Palette: drag to add to the board + click to select, then click the board to place ----

  /**
   * Pressing a palette button: (1) selects/deselects the brush (pressing the same piece
   * again deselects) + (2) starts dragging a new piece (drop on the board to add/replace,
   * drop outside to cancel).
   * The drag ghost follows the cursor so the mouseup target is no longer the button,
   * hence selection is handled at mousedown time instead of on the click event.
   */
  function paletteDown(color: cg.Color, role: cg.Role, e: MouseEvent | TouchEvent): void {
    if (!api) return;
    brush = brush && brush.color === color && brush.role === role ? null : { color, role };
    warning = null;
    if (e.cancelable) e.preventDefault();
    dragNewPiece(api.state, { role, color }, false, e as cg.MouchEvent, undefined, true);
    // chessgroundx bug workaround: drag end does not pass the force flag to userMove,
    // so dropping a new piece on an "occupied square" is silently rejected. Check the
    // drop point ourselves and finish the replacement on occupied squares (empty
    // squares are handled correctly by chessground).
    const onUp = (ev: MouseEvent | TouchEvent): void => {
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchend', onUp);
      setTimeout(() => finishPaletteDrop(color, role, ev), 0); // run after cg end()
    };
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
  }

  function finishPaletteDrop(color: cg.Color, role: cg.Role, ev: MouseEvent | TouchEvent): void {
    if (!api) return;
    const t = 'changedTouches' in ev ? ev.changedTouches[0] : ev;
    if (!t) return;
    const key = getKeyAtDomPos(
      [t.clientX, t.clientY],
      orientation === 'w',
      el.getBoundingClientRect(),
      { width: 9, height: 10 },
    );
    if (!key) return; // drop outside the board = cancel
    const letter = role[0] ?? '';
    const cased = color === 'white' ? letter.toUpperCase() : letter;
    const occupant = fenBoard(api.getFen()).get(keyToUci(key));
    if (!occupant || occupant === cased) return; // empty square (already handled) or same piece: nothing to do
    api.setPieces(new Map([[key, { role, color }]]) as cg.PiecesDiff);
    syncFromBoard();
  }

  // Board click-to-place: remember the press position and use movement distance to distinguish from a drag
  let downAt: [number, number] | null = null;
  function boardDown(e: PointerEvent): void {
    downAt = [e.clientX, e.clientY];
  }
  function boardClick(e: MouseEvent): void {
    if (!api) return;
    if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 8) return; // it was a drag
    const key = getKeyAtDomPos(
      [e.clientX, e.clientY],
      orientation === 'w',
      el.getBoundingClientRect(),
      { width: 9, height: 10 },
    );
    if (!key) return;
    // Clicking a piece on the board always selects that piece (brush is deselected).
    // To place on top of an existing piece, drag it from the palette instead.
    const piece = fenBoard(api.getFen()).get(keyToUci(key));
    if (piece) {
      brush = null;
      selectedKey = key !== selectedKey ? key : null;
      return;
    }
    // Empty square: place if a brush is active, otherwise clear the selection
    if (brush) {
      const letter = brush.role[0] ?? '';
      if (!canPlace(brush.color, letter, key)) return;
      api.setPieces(new Map([[key, { role: brush.role, color: brush.color }]]) as cg.PiecesDiff);
      syncFromBoard();
      return;
    }
    selectedKey = null;
  }

  /** Delete the selected piece with Delete/Backspace. */
  function onKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Backspace' && e.key !== 'Delete') return;
    const tag = (document.activeElement?.tagName ?? '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return; // ignore while typing in FEN etc.
    if (!api || !selectedKey) return;
    e.preventDefault();
    api.setPieces(new Map([[selectedKey, undefined]]) as cg.PiecesDiff);
    syncFromBoard();
  }

  // Selection marker (reusing the lastMove highlight)
  $effect(() => {
    api?.set({ lastMove: selectedKey ? [selectedKey] : [] });
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

  function komi(): number {
    if (komiSide === 'none') return 0;
    if (komiAmount === 'default') return HAN_KOMI;
    return Number.isFinite(komiCustom) ? komiCustom : 0;
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
      komi: komi(),
      komiSide,
      orientation,
    });
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="editor janggi kakao">
  <h2>{t('editor.title')}</h2>
  <p class="hint">{t('editor.hint')}</p>

  <div class="layout">
    <div class="board-col">
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <div class="board-shell" role="presentation" onpointerdown={boardDown} onclick={boardClick}>
        <div class="board" bind:this={el}></div>
      </div>
    </div>

    <div class="side">
      <div class="palette">
        <div class="row pieces">
          {#each ROLES as r (r.letter)}
            <button
              class="pbtn"
              aria-label={`cho-${r.letter}`}
              class:active={brush !== null && brush.color === 'white' && brush.role === r.role}
              onmousedown={e => paletteDown('white', r.role, e)}
              ontouchstart={e => paletteDown('white', r.role, e)}
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
              class:active={brush !== null && brush.color === 'black' && brush.role === r.role}
              onmousedown={e => paletteDown('black', r.role, e)}
              ontouchstart={e => paletteDown('black', r.role, e)}
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

      <div class="opt">
        <span class="opt-label">{t('setup.orientation')}</span>
        <div class="seg">
          <button class:active={orientation === 'w'} onclick={() => (orientation = 'w')}>{t('orient.cho')}</button>
          <button class:active={orientation === 'b'} onclick={() => (orientation = 'b')}>{t('orient.han')}</button>
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

      <!-- With an arbitrary placement the second player's komi is unknown, so specify the receiving side and amount directly (plan §5.4) -->
      <div class="opt">
        <span class="opt-label">{t('setup.komi')}</span>
        <div class="seg">
          <button class:active={komiSide === 'none'} onclick={() => (komiSide = 'none')}>{t('komi.none')}</button>
          <button class:active={komiSide === 'han'} onclick={() => (komiSide = 'han')}>{t('komi.sideHan')}</button>
          <button class:active={komiSide === 'cho'} onclick={() => (komiSide = 'cho')}>{t('komi.sideCho')}</button>
        </div>
      </div>

      {#if komiSide !== 'none'}
        <div class="opt">
          <span class="opt-label">{t('komi.amount')}</span>
          <div class="seg">
            <button class:active={komiAmount === 'default'} onclick={() => (komiAmount = 'default')}>{t('komi.default')}</button>
            <button class:active={komiAmount === 'custom'} onclick={() => (komiAmount = 'custom')}>{t('komi.custom')}</button>
            {#if komiAmount === 'custom'}
              <input class="komi-input" type="number" step="0.5" min="0" bind:value={komiCustom} />
            {/if}
          </div>
        </div>
      {/if}

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
    cursor: grab;
    padding: 3px;
    touch-action: none;
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
    pointer-events: none;
  }
  .tool {
    border: 1.5px solid var(--line);
    background: #fff;
    border-radius: 8px;
    padding: 6px 12px;
    font-size: 13.5px;
    cursor: pointer;
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
  .komi-input {
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
