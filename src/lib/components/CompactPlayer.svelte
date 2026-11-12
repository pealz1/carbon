<script lang="ts">
  import { player } from "$lib/player.svelte";
  import { compact } from "$lib/popout/compact.svelte";
  import MiniPlayer from "./MiniPlayer.svelte";
  import YoutubeSlot from "./YoutubeSlot.svelte";

  // Compact mode: the main window as a mini player, with YouTube's video in place of the artwork.
</script>

<div class="compact">
  <MiniPlayer now={player} expandLabel="Back to the full window" onexpand={compact.exit}>
    {#snippet video()}<YoutubeSlot />{/snippet}
  </MiniPlayer>
</div>

<style>
  .compact {
    position: fixed;
    inset: 0;
    z-index: 1;
  }
</style>
