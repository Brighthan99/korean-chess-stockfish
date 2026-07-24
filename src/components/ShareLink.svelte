<script lang="ts">
  import { t } from '../lib/i18n.svelte';

  let { url }: { url: string } = $props();

  let copied = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function copy(): void {
    void navigator.clipboard.writeText(url).then(() => {
      // Restart the animation even when clicked repeatedly
      copied = false;
      requestAnimationFrame(() => {
        copied = true;
        clearTimeout(timer);
        timer = setTimeout(() => (copied = false), 1400);
      });
    });
  }
</script>

<div class="share">
  <div class="share-head">
    <span class="share-label">{t('share.link')}</span>
    <button class="copy-btn" onclick={copy} aria-label={t('share.copy')}>
      {#if copied}
        <span class="check">✓</span>
      {:else}
        {t('share.copy')}
      {/if}
    </button>
  </div>
  <code class="share-url">{url}</code>
</div>

<style>
  .share {
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: var(--panel);
    border-radius: 8px;
    padding: 8px 12px;
  }
  .share-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .share-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--sub);
  }
  .copy-btn {
    border: 1.5px solid var(--line);
    background: #fff;
    border-radius: 6px;
    padding: 2px 10px;
    font-size: 12px;
    cursor: pointer;
    color: var(--sub);
    min-width: 52px;
    height: 24px;
    line-height: 1;
  }
  .copy-btn:hover {
    border-color: var(--cho);
    color: var(--cho);
  }
  .check {
    display: inline-block;
    color: var(--cho);
    font-weight: 700;
    animation: check-pop 1.4s ease forwards;
  }
  @keyframes check-pop {
    0% {
      opacity: 0;
      transform: scale(0.3);
    }
    15% {
      opacity: 1;
      transform: scale(1.3);
    }
    28% {
      transform: scale(1);
    }
    75% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: scale(0.8);
    }
  }
  .share-url {
    font-family: 'SF Mono', Menlo, monospace;
    font-size: 11.5px;
    color: var(--sub);
    word-break: break-all;
    user-select: text;
  }
</style>
