<script lang="ts">
  import type { Top } from "$lib/history/wrapped";
  import Rows from "./Rows.svelte";

  // The five most played songs.
  let { songs }: { songs: Top[] } = $props();
</script>

<section class="top-songs">
  <h2 class="title rise">Top songs</h2>
  <Rows items={songs} art />
</section>

<style>
  .top-songs {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
    align-items: start;
    gap: var(--sp-6);
  }

  /* Level with the first row, not above it. */
  .title {
    padding-top: var(--sp-4);
  }
</style>
