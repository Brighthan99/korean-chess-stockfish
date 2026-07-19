<script lang="ts">
  import Board from './components/Board.svelte';
  import SetupScreen from './components/SetupScreen.svelte';
  import GamePanel from './components/GamePanel.svelte';
  import EditorScreen from './components/EditorScreen.svelte';
  import { game } from './lib/game.svelte';
  import { i18n, t, type Locale } from './lib/i18n.svelte';

  // 첫 화면 = 대국 화면: 미완료 저장 대국이 있으면 복원, 없으면 기본 옵션으로 즉시 시작
  const ready = game.autoStart();

  // 언어 전환 시 문서 제목/lang 속성도 갱신
  $effect(() => {
    document.title = t('app.title');
    document.documentElement.lang = i18n.locale;
  });

  const LOCALES: { id: Locale; label: string }[] = [
    { id: 'ko', label: '한국어' },
    { id: 'en', label: 'English' },
  ];

  function onBackdropClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) game.closeOverlay();
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && game.overlay) game.closeOverlay();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<header>
  <h1>{t('app.name')} <small>{t('app.subtitle')}</small></h1>
  <div class="lang" role="group" aria-label="Language">
    {#each LOCALES as l (l.id)}
      <button class:active={i18n.locale === l.id} onclick={() => i18n.set(l.id)}>{l.label}</button>
    {/each}
  </div>
</header>

<main>
  {#await ready}
    <p class="loading">{t('loading.ffish')}</p>
  {:then}
    <div class="play">
      <div class="board-col">
        <Board />
      </div>
      <GamePanel />
    </div>

    {#if game.overlay}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="backdrop" role="presentation" onclick={onBackdropClick}>
        <div class="modal" role="dialog" aria-modal="true">
          <button class="close" aria-label={t('modal.close')} onclick={() => game.closeOverlay()}>✕</button>
          {#if game.overlay === 'setup'}
            <SetupScreen />
          {:else}
            <EditorScreen />
          {/if}
        </div>
      </div>
    {/if}
  {:catch e}
    <p class="loading error">{t('loading.failed')} {e?.message ?? e}</p>
  {/await}
</main>

<footer>
  {t('footer.pieces')}
  <a href="https://github.com/Kadagaden/chess-pieces" target="_blank" rel="noopener">Kadagaden</a>
  (CC BY 4.0) · {t('footer.engine')}
  <a href="https://github.com/fairy-stockfish/Fairy-Stockfish" target="_blank" rel="noopener">Fairy-Stockfish</a>
  (GPL-3.0) · {t('footer.sourcePre')}
  <a href="https://github.com/Brighthan99/korean-chess-stockfish" target="_blank" rel="noopener">{t('footer.sourceLink')}</a>{t('footer.sourcePost')}
</footer>

<style>
  header {
    padding: 14px 20px 10px;
    border-bottom: 2px solid var(--cho);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  h1 {
    margin: 0;
    font-size: 21px;
  }
  h1 small {
    color: var(--sub);
    font-weight: 400;
    font-size: 14px;
    margin-left: 8px;
  }
  .lang {
    display: flex;
    gap: 4px;
  }
  .lang button {
    border: 1.5px solid var(--line);
    background: #fff;
    border-radius: 8px;
    padding: 4px 10px;
    font-size: 12.5px;
    cursor: pointer;
    color: var(--sub);
  }
  .lang button.active {
    border-color: var(--cho);
    background: var(--cho);
    color: #fff;
  }
  main {
    padding: 20px;
    max-width: 1040px;
    margin: 0 auto;
  }
  .loading {
    text-align: center;
    color: var(--sub);
    padding: 48px 0;
  }
  .loading.error {
    color: var(--han);
  }
  .play {
    display: flex;
    gap: 20px;
    justify-content: center;
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .board-col {
    flex: 0 1 560px;
    width: min(92vw, 560px);
  }
  /* 레이오버 (새 대국 옵션 / 보드 에디터) */
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(20, 26, 34, 0.55);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 4vh 16px;
    z-index: 100;
    overflow-y: auto;
  }
  .modal {
    position: relative;
    background: #fff;
    border-radius: 14px;
    padding: 24px 22px 22px;
    width: min(96vw, 1020px);
    max-height: 92vh;
    overflow-y: auto;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.3);
  }
  .close {
    position: absolute;
    top: 10px;
    right: 12px;
    border: none;
    background: none;
    font-size: 18px;
    color: var(--sub);
    cursor: pointer;
    padding: 6px;
    line-height: 1;
  }
  .close:hover {
    color: var(--ink);
  }
  footer {
    text-align: center;
    color: var(--sub);
    font-size: 12.5px;
    padding: 24px 16px 32px;
  }
  footer a {
    color: var(--cho);
  }
</style>
