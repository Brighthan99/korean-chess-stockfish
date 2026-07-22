<script lang="ts">
  import { onMount } from 'svelte';
  import { Chessground } from 'chessgroundx/chessground.js';
  import type { Api } from 'chessgroundx/api.js';
  import type { Config } from 'chessgroundx/config.js';
  import type * as cg from 'chessgroundx/types.js';
  import { game } from '../lib/game.svelte';
  import { keyToUci } from '../lib/notation';

  let el: HTMLElement;
  let api: Api | undefined;

  function onAfter(orig: cg.Key, dest: cg.Key): void {
    game.move(keyToUci(orig) + keyToUci(dest));
  }

  function buildConfig(): Config {
    const turnColor: cg.Color = game.turn === 'w' ? 'white' : 'black';
    const movableColor: cg.Color =
      game.mode === 'ai' ? (game.humanColor === 'w' ? 'white' : 'black') : turnColor;
    return {
      fen: game.boardFen.split(' ')[0],
      orientation: game.orientation === 'b' ? 'black' : 'white',
      turnColor,
      lastMove: (game.lastMove ?? undefined) as cg.Key[] | undefined,
      check: game.checkKey ? ([game.checkKey] as cg.Key[]) : false,
      coordinates: false,
      viewOnly: game.result !== null,
      dimensions: { width: 9, height: 10 },
      animation: { enabled: true, duration: 150 },
      highlight: { lastMove: true, check: true },
      premovable: { enabled: false },
      movable: {
        free: false,
        color: movableColor,
        dests: game.dests as unknown as cg.Dests,
        showDests: true,
        events: { after: onAfter },
      },
      drawable: { enabled: false, visible: true },
    };
  }

  onMount(() => {
    api = Chessground(el, buildConfig());
    return () => api?.destroy();
  });

  // Game state change → board update
  $effect(() => {
    const cfg = buildConfig();
    api?.set(cfg);
  });

  // Arrow for the AI-suggested move
  $effect(() => {
    const hint = game.hint;
    api?.setAutoShapes(
      hint ? [{ orig: hint[0] as cg.Key, dest: hint[1] as cg.Key, brush: 'blue' }] : [],
    );
  });
</script>

<div class="board-shell janggi kakao">
  <div class="board" bind:this={el}></div>
</div>

<style>
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
</style>
