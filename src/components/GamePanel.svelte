<script lang="ts">
  import { game } from '../lib/game.svelte';
  import { isMuted, setMuted } from '../lib/sound';
  import { formatMove } from '../lib/notation';
  import { i18n, t } from '../lib/i18n.svelte';
  import { toPgn, toGib, download } from '../lib/gibo';

  let muted = $state(isMuted());
  let copied = $state(false);
  let nnueInput = $state<HTMLInputElement>();

  function toggleMute(): void {
    muted = !muted;
    setMuted(muted);
  }

  async function onNnueFile(ev: Event): Promise<void> {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (file) await game.setNnueFile(file);
    (ev.target as HTMLInputElement).value = '';
  }

  function stamp(): string {
    // 로컬 날짜 (gibo.ts의 헤더 날짜와 동일 기준)
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  function copyFen(): void {
    void navigator.clipboard.writeText(game.boardFen).then(() => {
      copied = true;
      setTimeout(() => (copied = false), 1500);
    });
  }

  function savePgn(): void {
    const ffish = game.ffish;
    if (!ffish) return;
    download(`janggi-${stamp()}.pgn`, toPgn(ffish, game.ruleset, game.startFen, game.moves, game.result));
  }

  function saveGib(): void {
    const ai = game.mode === 'ai';
    download(
      `janggi-${stamp()}.gib`,
      toGib(game.startFen, game.moves, game.result, {
        choPlayer: ai && game.humanColor === 'b' ? 'AI' : 'Player',
        hanPlayer: ai && game.humanColor === 'w' ? 'AI' : 'Player',
      }),
    );
  }

  const evalDisplay = $derived.by(() => {
    const e = game.evalForCho();
    if (!e) return null;
    if (e.mate !== undefined) {
      return {
        text: e.mate > 0 ? t('eval.choMate', { n: e.mate }) : t('eval.hanMate', { n: -e.mate }),
        ratio: e.mate > 0 ? 1 : 0,
      };
    }
    const cp = e.cp ?? 0;
    // 시그모이드로 0~1 비율 변환 (초 우세 = 1 쪽)
    const ratio = 1 / (1 + Math.exp(-cp / 300));
    return {
      text: cp >= 0 ? t('eval.choAhead', { n: (cp / 100).toFixed(1) }) : t('eval.hanAhead', { n: (-cp / 100).toFixed(1) }),
      ratio,
    };
  });

  const resultText = $derived(
    game.result ? t(`result.${game.result}`) + (game.resigned ? ` ${t('result.resign')}` : '') : null,
  );

  const humanTurn = $derived(
    game.result === null && (game.mode === 'manual' || game.turn === game.humanColor),
  );
</script>

<aside class="panel">
  <div class="score">
    <div class="side cho" class:turn={game.turn === 'w' && !game.result}>
      <span class="name">{t('side.cho')}</span>
      <span class="pts">{game.score.cho}</span>
    </div>
    <div class="vs">
      {#if resultText}
        <span class="result">{resultText}</span>
      {:else if game.thinking}
        <span class="status">{t('status.aiThinking')}</span>
      {:else if game.checkKey}
        <span class="status check">{t('status.check')}</span>
      {:else if game.bikjang}
        <span class="status check">{t('status.bikjang')}</span>
      {:else}
        <span class="status">{game.turn === 'w' ? t('status.choTurn') : t('status.hanTurn')}</span>
      {/if}
    </div>
    <div class="side han" class:turn={game.turn === 'b' && !game.result}>
      <span class="name">{t('side.han')}</span>
      <span class="pts">{game.score.han}</span>
    </div>
  </div>

  <!-- 덤 받는 쪽 — 대국 중에도 변경 가능 (점수판 즉시 반영) -->
  <div class="komi-row">
    <span class="komi-label">{t('panel.komi')} {game.komi}</span>
    <div class="komi-seg">
      <button class:active={game.komiSide === 'han'} onclick={() => game.setKomiSide('han')}>{t('side.han')}</button>
      <button class:active={game.komiSide === 'cho'} onclick={() => game.setKomiSide('cho')}>{t('side.cho')}</button>
      <button class:active={game.komiSide === 'none'} onclick={() => game.setKomiSide('none')}>{t('komi.none')}</button>
    </div>
  </div>

  {#if game.engineError}
    <div class="engine-error">{t('engine.unavailable')}: {t(game.engineError)}</div>
  {/if}

  {#if game.analysisOn}
    <div class="analysis">
      <div class="eval-bar">
        <div class="cho-fill" style={`width:${((evalDisplay?.ratio ?? 0.5) * 100).toFixed(1)}%`}></div>
      </div>
      <div class="eval-text">
        <b>{evalDisplay?.text ?? t('eval.analyzing')}</b>
        <small>{game.evalInfo ? `depth ${game.evalInfo.depth}` : ''}</small>
      </div>
      <div class="pv">{game.evalPv}</div>
    </div>
  {/if}

  <div class="buttons">
    <button onclick={() => game.undo()} disabled={game.moves.length === 0}>{t('btn.undo')}</button>
    <button onclick={() => game.redo()} disabled={game.redoStack.length === 0 || game.result !== null}>{t('btn.redo')}</button>
    <button onclick={() => game.pass()} disabled={!game.canPass || !humanTurn}>{t('btn.pass')}</button>
    <button onclick={() => void game.requestHint()} disabled={!game.engineReady || game.thinking || game.result !== null}>
      {t('btn.hint')}
    </button>
    <button class:on={game.analysisOn} onclick={() => game.toggleAnalysis()} disabled={!game.engineReady}>
      {t('btn.analysis')}
    </button>
    <button onclick={() => game.flipOrientation()}>{t('btn.flip')}</button>
    <button onclick={() => game.resign()} disabled={game.result !== null}>{t('btn.resign')}</button>
    <button onclick={() => game.newGame()}>{t('btn.newGame')}</button>
    <button onclick={() => game.openEditor()}>{t('btn.custom')}</button>
    <button onclick={toggleMute}>{muted ? t('btn.soundOn') : t('btn.soundOff')}</button>
  </div>

  <div class="export">
    <button onclick={copyFen}>{copied ? t('export.copied') : t('export.fen')}</button>
    <button onclick={savePgn} disabled={game.moves.length === 0}>{t('export.pgn')}</button>
    <button onclick={saveGib} disabled={game.moves.length === 0}>{t('export.gib')}</button>
  </div>

  <div class="nnue">
    <div class="nnue-head">
      <span class="nnue-title">{t('nnue.title')}</span>
      {#if game.nnueName}
        <button
          class="nnue-toggle"
          class:on={game.nnueActive}
          disabled={game.nnueBusy || game.thinking || !game.engineReady}
          onclick={() => void game.toggleNnue()}
        >
          {game.nnueBusy ? t('nnue.loading') : game.nnueActive ? t('nnue.on') : t('nnue.off')}
        </button>
      {/if}
    </div>
    {#if game.nnueName}
      <div class="nnue-file">
        <span class="nnue-name" title={game.nnueName}>{game.nnueName}</span>
        <button class="nnue-del" onclick={() => void game.removeNnue()} disabled={game.nnueBusy}>{t('nnue.delete')}</button>
      </div>
    {:else}
      <p class="nnue-desc">{t('nnue.desc')}</p>
      <div class="nnue-row">
        <input bind:this={nnueInput} type="file" accept=".nnue" hidden onchange={e => void onNnueFile(e)} />
        <button class="nnue-choose" onclick={() => nnueInput?.click()}>{t('nnue.choose')}</button>
        <a class="nnue-link" href="https://fairy-stockfish.github.io/nnue/" target="_blank" rel="noopener">
          {t('nnue.download')} ↗
        </a>
      </div>
    {/if}
    {#if game.nnueError}
      <p class="nnue-err">{t(game.nnueError)}</p>
    {/if}
  </div>

  <div class="movelist">
    {#each game.moves as m (m.ply)}
      <div class="mv" class:cho={m.color === 'w'} class:han={m.color === 'b'}>
        <span class="no">{m.ply}.</span>
        <span class="kja">{formatMove(m.uci, m.piece, m.captured, m.check, i18n.locale)}</span>
      </div>
    {:else}
      <div class="empty">{t('moves.empty')}</div>
    {/each}
  </div>
</aside>

<style>
  /* 패널 폭을 고정해 형세판단 문자열 길이가 변해도 레이아웃이 움직이지 않게 한다 */
  .panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 300px;
    flex: 0 0 300px;
  }
  @media (max-width: 900px) {
    .panel {
      width: min(92vw, 560px);
      flex: 1 1 auto;
      max-width: 560px;
    }
  }
  .score {
    display: flex;
    align-items: stretch;
    border: 1px solid var(--line);
    border-radius: 10px;
    overflow: hidden;
  }
  .side {
    flex: 1 1 0;
    min-width: 0;
    padding: 10px 4px;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 2px;
    border-bottom: 3px solid transparent;
  }
  .side.cho .name {
    color: var(--cho);
    font-weight: 700;
  }
  .side.han .name {
    color: var(--han);
    font-weight: 700;
  }
  .side.turn {
    background: #fbf7ea;
  }
  .side.cho.turn {
    border-bottom-color: var(--cho);
  }
  .side.han.turn {
    border-bottom-color: var(--han);
  }
  .pts {
    font-size: 20px;
    font-weight: 700;
  }
  .vs {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 4px;
    flex: 0 0 96px;
    text-align: center;
    overflow: hidden;
  }
  .status {
    color: var(--sub);
    font-size: 13px;
  }
  .status.check {
    color: var(--han);
    font-weight: 700;
    font-size: 15px;
  }
  .result {
    font-weight: 700;
    color: var(--cho);
    font-size: 13.5px;
  }
  .komi-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 12.5px;
    padding: 0 2px;
  }
  .komi-label {
    color: var(--sub);
    font-weight: 600;
    white-space: nowrap;
  }
  .komi-seg {
    display: flex;
    gap: 4px;
  }
  .komi-seg button {
    border: 1.5px solid var(--line);
    background: #fff;
    border-radius: 14px;
    padding: 2px 10px;
    font-size: 12px;
    cursor: pointer;
    color: var(--sub);
  }
  .komi-seg button.active {
    border-color: var(--cho);
    background: var(--cho);
    color: #fff;
  }
  .engine-error {
    background: #fdf0f0;
    border-left: 3px solid var(--han);
    padding: 8px 10px;
    font-size: 13px;
    border-radius: 0 6px 6px 0;
  }
  .analysis {
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .eval-bar {
    height: 10px;
    border-radius: 5px;
    background: var(--han);
    overflow: hidden;
    flex: none;
  }
  .cho-fill {
    height: 100%;
    background: var(--cho);
    transition: width 0.3s;
  }
  /* 평가 텍스트/PV는 높이·줄수를 고정해 내용 변화로 세로 흔들림이 없게 한다 */
  .eval-text {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-size: 14px;
    white-space: nowrap;
    overflow: hidden;
    height: 1.5em;
    flex: none;
  }
  .eval-text b {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .eval-text small {
    color: var(--sub);
    margin-left: 8px;
    flex: none;
  }
  .pv {
    font-size: 12.5px;
    color: var(--sub);
    word-break: break-all;
    line-height: 1.5;
    height: 4.5em; /* 3줄 고정 */
    overflow: hidden;
  }
  .buttons {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .buttons button {
    border: 1.5px solid var(--line);
    background: #fff;
    border-radius: 8px;
    padding: 8px 6px;
    font-size: 14px;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .buttons button:hover:not(:disabled) {
    border-color: var(--cho);
  }
  .buttons button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .buttons button.on {
    background: var(--cho);
    color: #fff;
    border-color: var(--cho);
  }
  .export {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 6px;
  }
  .export button {
    border: 1.5px solid var(--line);
    background: var(--panel);
    border-radius: 8px;
    padding: 6px 4px;
    font-size: 12.5px;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .export button:hover:not(:disabled) {
    border-color: var(--cho);
  }
  .export button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  /* NNUE (강한 AI) */
  .nnue {
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
  }
  .nnue-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .nnue-title {
    font-weight: 700;
    font-size: 13.5px;
  }
  .nnue-toggle {
    border: 1.5px solid var(--line);
    background: #fff;
    border-radius: 20px;
    padding: 3px 14px;
    font-size: 12.5px;
    cursor: pointer;
    white-space: nowrap;
  }
  .nnue-toggle.on {
    background: var(--cho);
    border-color: var(--cho);
    color: #fff;
  }
  .nnue-toggle:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .nnue-file {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .nnue-name {
    color: var(--sub);
    font-family: 'SF Mono', Menlo, monospace;
    font-size: 11.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .nnue-del {
    border: none;
    background: none;
    color: var(--han);
    font-size: 12px;
    cursor: pointer;
    flex: none;
    padding: 2px 4px;
  }
  .nnue-desc {
    margin: 0;
    color: var(--sub);
    font-size: 12px;
    line-height: 1.5;
  }
  .nnue-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .nnue-choose {
    border: 1.5px solid var(--line);
    background: #fff;
    border-radius: 8px;
    padding: 5px 10px;
    font-size: 12.5px;
    cursor: pointer;
  }
  .nnue-choose:hover {
    border-color: var(--cho);
  }
  .nnue-link {
    color: var(--cho);
    font-size: 12px;
  }
  .nnue-err {
    margin: 0;
    color: var(--han);
    font-size: 12.5px;
  }
  .movelist {
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 8px;
    max-height: 300px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 14px;
  }
  .mv {
    display: flex;
    gap: 8px;
    padding: 2px 6px;
    border-radius: 4px;
  }
  .mv .no {
    color: var(--sub);
    min-width: 32px;
    text-align: right;
  }
  .mv.cho .kja {
    color: var(--cho);
  }
  .mv.han .kja {
    color: var(--han);
  }
  .empty {
    color: var(--sub);
    text-align: center;
    padding: 12px;
    font-size: 13px;
  }
</style>
