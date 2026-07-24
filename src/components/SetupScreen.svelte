<script lang="ts">
  import { SETUPS, type SetupId } from '../lib/setups';
  import { HAN_KOMI } from '../lib/rules';
  import { game, type Ruleset, type GameConfig, type KomiSide } from '../lib/game.svelte';
  import { i18n, t } from '../lib/i18n.svelte';
  import { parseGibo, readGiboFile } from '../lib/gibo';
  import { buildPlayUrl } from '../lib/playlink';
  import ShareLink from './ShareLink.svelte';

  // Restore last-used options (kc-setup)
  const saved = ((): Record<string, unknown> => {
    try {
      return JSON.parse(localStorage.getItem('kc-setup') ?? '{}') as Record<string, unknown>;
    } catch {
      return {};
    }
  })();
  const pick = <T,>(v: unknown, allowed: readonly T[], dflt: T): T =>
    allowed.includes(v as T) ? (v as T) : dflt;

  const SETUP_IDS = ['inner', 'left', 'right', 'outer'] as const;
  const RULESET_IDS: Ruleset[] = ['janggi', 'janggitraditional', 'janggimodern', 'janggicasual'];

  let choSetup = $state<SetupId>(pick(saved.cho, SETUP_IDS, 'inner'));
  let hanSetup = $state<SetupId>(pick(saved.han, SETUP_IDS, 'inner'));
  let firstMover = $state<'w' | 'b'>(pick(saved.firstMover, ['w', 'b'] as const, 'w'));
  let playMode = $state<'ai-cho' | 'ai-han' | 'manual'>(
    pick(saved.playMode, ['ai-cho', 'ai-han', 'manual'] as const, 'ai-cho'),
  );
  let aiMovetime = $state(pick(saved.aiMovetime, [300, 1000, 3000] as const, 1000));
  let ruleset = $state<Ruleset>(pick(saved.ruleset, RULESET_IDS, 'janggi'));
  // svelte-ignore state_referenced_locally -- only used to compute the initial default (intended)
  let orientation = $state<'w' | 'b'>(
    pick(saved.orientation, ['w', 'b'] as const, playMode === 'ai-han' ? 'b' : 'w'),
  );
  let komiSide = $state<KomiSide>(pick(saved.komiSide, ['han', 'cho', 'none'] as const, 'han'));

  // Only when the play mode "changes" does the default board orientation follow so my pieces sit at the bottom
  // (compare with the previous value so the restored value isn't overwritten right after mount)
  // Options are saved immediately on change — restored as-is next time even without pressing Start
  $effect(() => {
    localStorage.setItem(
      'kc-setup',
      JSON.stringify({ cho: choSetup, han: hanSetup, firstMover, playMode, aiMovetime, ruleset, orientation, komiSide }),
    );
  });

  // svelte-ignore state_referenced_locally -- previous value for change detection (intended)
  let lastPlayMode = playMode;
  $effect(() => {
    if (playMode !== lastPlayMode) {
      lastPlayMode = playMode;
      orientation = playMode === 'ai-han' ? 'b' : 'w';
    }
  });

  // Game record (gibo) import
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
      komi: HAN_KOMI,
      komiSide,
      orientation,
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

  // Opening setup preview string — back rank: R [H/E] [H/E] A K A [H/E] [H/E] R
  const PREVIEW_KO: Record<string, string> = { '마': '마', '상': '상' };
  const PREVIEW_EN: Record<string, string> = { '마': 'H', '상': 'E' };
  function preview(pattern: string): string {
    const map = i18n.locale === 'ko' ? PREVIEW_KO : PREVIEW_EN;
    const p = [...pattern].map(ch => map[ch] ?? ch);
    const [r, a, k] = i18n.locale === 'ko' ? ['차', '사', '궁'] : ['R', 'A', 'K'];
    return `${r}${p[0]}${p[1]}${a} ${k} ${a}${p[2]}${p[3]}${r}`;
  }

  function start(): void {
    void game.startGame({ choSetup, hanSetup, firstMover, ...currentConfig() });
  }

  // /play URL for the current selections — display only (plain text, PLAY.md)
  const shareUrl = $derived(
    buildPlayUrl({
      cho: choSetup,
      han: hanSetup,
      first: firstMover === 'b' ? 'han' : 'cho',
      mode: playMode,
      time: aiMovetime,
      rules: ruleset,
      komi: komiSide,
      komiPoints: HAN_KOMI,
      orient: orientation === 'b' ? 'han' : 'cho',
    }),
  );
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

    <div class="opt">
      <span class="opt-label">{t('setup.orientation')}</span>
      <div class="seg">
        <button class:active={orientation === 'w'} onclick={() => (orientation = 'w')}>{t('orient.cho')}</button>
        <button class:active={orientation === 'b'} onclick={() => (orientation = 'b')}>{t('orient.han')}</button>
      </div>
    </div>

    <div class="opt">
      <span class="opt-label">{t('setup.komi')}</span>
      <div class="seg">
        <button class:active={komiSide === 'han'} onclick={() => (komiSide = 'han')}>{t('komi.sideHan')}</button>
        <button class:active={komiSide === 'cho'} onclick={() => (komiSide = 'cho')}>{t('komi.sideCho')}</button>
        <button class:active={komiSide === 'none'} onclick={() => (komiSide = 'none')}>{t('komi.none')}</button>
      </div>
    </div>

    <div class="score-preview">
      {t('setup.scorePreview')}
      <b class="cho-c">{t('setup.scoreCho', { n: 72 + (komiSide === 'cho' ? HAN_KOMI : 0) })}</b> :
      <b class="han-c">{t('setup.scoreHan', { n: 72 + (komiSide === 'han' ? HAN_KOMI : 0) })}</b>
      <small>
        {komiSide === 'han'
          ? t('setup.komiNote', { n: HAN_KOMI })
          : komiSide === 'cho'
            ? t('setup.komiNoteCho', { n: HAN_KOMI })
            : t('setup.komiNoteNone')}
      </small>
    </div>

    <button class="start" onclick={start}>{t('setup.start')}</button>

    <ShareLink url={shareUrl} />
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
