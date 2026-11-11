<script lang="ts">
  import { stage } from "$lib/youtube/stage.svelte";

  // A 16:9 box the YouTube player moves over while this view is on screen.
  let el = $state<HTMLElement>();
  $effect(() => (el ? stage.claim(el) : undefined));
</script>

<div class="slot" bind:this={el} aria-hidden="true"></div>

<style>
  /* YouTube requires embedded players to be at least 200 × 200 px. */
  .slot {
    width: 100%;
    min-width: 200px;
    min-height: 200px;
    aspect-ratio: 16 / 9;
    border-radius: var(--r-art);
    background: #000;
  }
</style>
