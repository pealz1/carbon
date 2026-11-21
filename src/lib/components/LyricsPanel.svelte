<script lang="ts">
  import Lyrics from "./Lyrics.svelte";

  // Lyrics docked at the window's right edge, on the wallpaper; the stage narrows to make room.
  // The layout only mounts this while a song is loaded.
</script>

<aside class="lyrics-panel" aria-label="Lyrics">
  <Lyrics variant="panel" />
</aside>

<style>
  .lyrics-panel {
    grid-area: lyrics;
    min-height: 0;
    padding: 0 var(--sp-2) 0 var(--sp-3);
    color: var(--chrome-text);
    animation: dock-in var(--dur-slow) var(--ease-out) backwards;
  }

  @keyframes dock-in {
    from {
      opacity: 0;
      transform: translateX(24px);
    }
  }
</style>
