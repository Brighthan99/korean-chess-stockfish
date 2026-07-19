<script lang="ts">
  import { SETUPS, type SetupId } from '../lib/setups';
  import { HAN_DUM } from '../lib/rules';
  import { game, type Ruleset, type GameConfig } from '../lib/game.svelte';
  import { i18n, t } from '../lib/i18n.svelte';
  import { parseGibo, readGiboFile } from '../lib/gibo';

  // 최근 선택 복원
  const saved = ((): Record<string, string> => {
    try {
      return JSON.parse(localStorage.getItem('kc-setup') ?? '{}') as Record<string, string>;
    } catch {
      return {};
    }
  })();

  let choSetup = $state<SetupId>((saved.cho as SetupId) ?? 'inner');
  let hanSetup = $state<SetupId>((saved.han as SetupId) ?? 'inner');
  let firstMover = $state<'w' | 'b'>('w');
  let playMode = $state<'ai-cho' | 'ai-han' | 'manual'>('ai-cho');
  let aiMovetime = $state(1000);
  let ruleset = $state<Ruleset>('janggi');

  const RULESET_IDS: Ruleset[] = ['janggi', 'janggitraditional', 'janggimodern', 'janggicasual'];

  // 기보 불러오기
  let showPaste = $state(false);
  let pasteText = $state('');
  let importError = $state<string | null>(null);
  let fileInput: HTMLInputElement;

  function currentConfig(): GameConfig {
    return {
      mode: playMode === 'manual' ? 'manual' : 'ai',
      humanColor: playMode === 'ai-han' ? 'b' : 'w',
      aiMovetime,
      ruleset,
      dum: HAN_DUM,
    };
  }

  function importErrorText(e: unknown): string {
    const msg = e instanceof Error ? e.message : String(e);
    const bad = /^import\.badMove:(\d+)$/.exec(msg);
    if (bad) return t('import.badMove', { n: bad[1]! });
    if (msg.startsWith('import.')) return t(msg);
    return t('import.error');
  }

  async function importText(text: string): Promise<void> {
    importError = null;
    const ffish = game.ffish;
    if (!ffish) return;
    try {
      const parsed = parseGibo(ffish, ruleset, text);
      await game.loadGame(parsed.fen, parsed.moves, currentConfig());
    } catch (e) {
      importError = importErrorText(e);
    }
  }

  async function onFileChosen(ev: Event): Promise<void> {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    await importText(await readGiboFile(file));
    (ev.target as HTMLInputElement).value = '';
  }

  // 차림 미리보기 문자열 — 뒷줄: 차 [마/상] [마/상] 사 궁 사 [마/상] [마/상] 차
  const PREVIEW_KO: Record<string, string> = { '마': '마', '상': '상' };
  const PREVIEW_EN: Record<string, string> = { '마': 'H', '상': 'E' };
  function preview(pattern: string): string {
    const map = i18n.locale === 'ko' ? PREVIEW_KO : PREVIEW_EN;
    const p = [...pattern].map(ch => map[ch] ?? ch);
    const [r, a, k] = i18n.locale === 'ko' ? ['차', '사', '궁'] : ['R', 'A', 'K'];
    return `${r}${p[0]}${p[1]}${a} ${k} ${a}${p[2]}${p[3]}${r}`;
  }

  function start(): void {
    localStorage.setItem('kc-setup', JSON.stringify({ cho: choSetup, han: hanSetup }));
    void game.startGame({ choSetup, hanSetup, firstMover, ...currentConfig() });
  }
</script>

<div class="setup">
  <section>
    <h2><span class="dot cho"></span>{t('setup.choSetup')}</h2>
    <div class="cards">
      {#each SETUPS as s (s.id)}
        <button class="card" class:active={choSetup === s.id} onclick={() => (choSetup = s.id)}>
          <b>{t(`setup.name.${s.id}`)}</b>
          <span class="pattern cho-c">{preview(s.pattern)}</span>
          <small>{t(`setup.desc.${s.id}`)}</small>
        </button>
      {/each}
    </div>
  </section>

  <section>
    <h2><span class="dot han"></span>{t('setup.hanSetup')} <small class="hint-txt">{t('setup.hanSeat')}</small></h2>
    <div class="cards">
      {#each SETUPS as s (s.id)}
        <button class="card" class:active={hanSetup === s.id} onclick={() => (hanSetup = s.id)}>
          <b>{t(`setup.name.${s.id}`)}</b>
          <span class="pattern han-c">{preview(s.pattern)}</span>
          <small>{t(`setup.desc.${s.id}`)}</small>
        </button>
      {/each}
    </div>
  </section>

  <section class="options">
    <div class="opt">
      <span class="opt-label">{t('setup.mode')}</span>
      <div class="seg">
        <button class:active={playMode === 'ai-cho'} onclick={() => (playMode = 'ai-cho')}>{t('setup.mode.aiCho')}</button>
        <button class:active={playMode === 'ai-han'} onclick={() => (playMode = 'ai-han')}>{t('setup.mode.aiHan')}</button>
        <button class:active={playMode === 'manual'} onclick={() => (playMode = 'manual')}>{t('setup.mode.manual')}</button>
      </div>
    </div>

    <div class="opt">
      <span class="opt-label">{t('setup.firstMover')}</span>
      <div class="seg">
        <button class:active={firstMover === 'w'} onclick={() => (firstMover = 'w')}>{t('setup.first.cho')}</button>
        <button class:active={firstMover === 'b'} onclick={() => (firstMover = 'b')}>{t('setup.first.han')}</button>
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

    <div class="score-preview">
      {t('setup.scorePreview')}
      <b class="cho-c">{t('setup.scoreCho')}</b> : <b class="han-c">{t('setup.scoreHan', { n: 72 + HAN_DUM })}</b>
      <small>{t('setup.dumNote', { n: HAN_DUM })}</small>
    </div>

    <button class="start" onclick={start}>{t('setup.start')}</button>
  </section>

  <section class="extras">
    <button class="extra" onclick={() => game.openEditor()}>{t('setup.editor')}</button>

    <div class="import">
      <h3>{t('import.title')}</h3>
      <div class="import-row">
        <input
          bind:this={fileInput}
          type="file"
          accept=".gib,.pgn,.txt"
          hidden
          onchange={e => void onFileChosen(e)}
        />
        <button class="extra" onclick={() => fileInput.click()}>📂 .gib / .pgn</button>
        <button class="extra" class:on={showPaste} onclick={() => (showPaste = !showPaste)}>{t('import.paste')}</button>
      </div>
      {#if showPaste}
        <textarea rows="5" bind:value={pasteText} spellcheck="false" placeholder='[Variant "Janggi"] … / [초차림 "마상상마"] 1. 79졸78 …'></textarea>
        <button class="extra load" onclick={() => void importText(pasteText)}>{t('import.load')}</button>
      {/if}
      {#if importError}
        <p class="import-error">{importError}</p>
      {/if}
      <p class="import-hint">{t('import.hint')}</p>
    </div>
  </section>
</div>

<style>
  .setup {
    display: flex;
    flex-direction: column;
    gap: 20px;
    max-width: 720px;
    margin: 0 auto;
  }
  h2 {
    font-size: 16px;
    margin: 0 0 8px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .hint-txt {
    color: var(--sub);
    font-weight: 400;
  }
  .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    display: inline-block;
  }
  .dot.cho {
    background: var(--cho);
  }
  .dot.han {
    background: var(--han);
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 8px;
  }
  .card {
    border: 1.5px solid var(--line);
    border-radius: 10px;
    background: #fff;
    padding: 10px 8px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 14px;
    transition: border-color 0.15s, background 0.15s;
  }
  .card:hover {
    border-color: var(--cho);
  }
  .card.active {
    border-color: var(--cho);
    background: #eef7f2;
  }
  .card b {
    font-size: 14.5px;
  }
  .pattern {
    font-size: 13px;
    letter-spacing: 1px;
  }
  .card small {
    color: var(--sub);
  }
  .options {
    display: flex;
    flex-direction: column;
    gap: 12px;
    border-top: 1px solid var(--line);
    padding-top: 16px;
  }
  .opt {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .opt-label {
    min-width: 90px;
    font-weight: 600;
    font-size: 14px;
  }
  .seg {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .seg button {
    border: 1.5px solid var(--line);
    background: #fff;
    border-radius: 8px;
    padding: 6px 12px;
    font-size: 13.5px;
    cursor: pointer;
  }
  .seg button.active {
    border-color: var(--cho);
    background: var(--cho);
    color: #fff;
  }
  .score-preview {
    background: var(--panel);
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 14px;
  }
  .score-preview small {
    color: var(--sub);
  }
  .start {
    align-self: center;
    background: var(--cho);
    color: #fff;
    border: none;
    border-radius: 10px;
    padding: 12px 48px;
    font-size: 17px;
    font-weight: 700;
    cursor: pointer;
  }
  .start:hover {
    filter: brightness(1.1);
  }
  .extras {
    border-top: 1px solid var(--line);
    padding-top: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .extra {
    border: 1.5px solid var(--line);
    background: #fff;
    border-radius: 8px;
    padding: 8px 14px;
    font-size: 14px;
    cursor: pointer;
    align-self: flex-start;
  }
  .extra:hover {
    border-color: var(--cho);
  }
  .extra.on {
    border-color: var(--cho);
    background: var(--cho);
    color: #fff;
  }
  .import h3 {
    font-size: 15px;
    margin: 0 0 8px;
  }
  .import-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .import textarea {
    width: 100%;
    margin-top: 8px;
    border: 1.5px solid var(--line);
    border-radius: 8px;
    padding: 8px 10px;
    font-family: 'SF Mono', Menlo, monospace;
    font-size: 12px;
    resize: vertical;
  }
  .load {
    margin-top: 6px;
  }
  .import-error {
    color: var(--han);
    font-size: 13.5px;
    margin: 8px 0 0;
  }
  .import-hint {
    color: var(--sub);
    font-size: 12.5px;
    margin: 8px 0 0;
  }
</style>
