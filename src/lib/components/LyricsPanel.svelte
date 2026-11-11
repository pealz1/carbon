<script lang="ts">
  import { player } from "$lib/player.svelte";
  import Lyrics from "./Lyrics.svelte";

  // Lyrics docked at the window's right edge, on the chrome; the stage narrows to make room.
</script>

<aside class="lyrics-panel" aria-label="Lyrics">
  {#if player.track}
    <Lyrics variant="panel" />
  {:else}
    <p class="idle">Lyrics show up here when something plays.</p>
  {/if}
</aside>

<style>
  .lyrics-panel {
    grid-area: lyrics;
    min-height: 0;
    padding: 0 var(--sp-2) 0 var(--sp-3);
    color: var(--chrome-text);
  }

  .idle {
    margin: var(--sp-5) var(--sp-3);
    color: var(--chrome-text-muted);
    font-size: var(--fs-body);
    line-height: 1.5;
  }
</style>
