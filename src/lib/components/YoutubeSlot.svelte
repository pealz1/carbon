<script lang="ts">
  import { stage } from "$lib/youtube/stage.svelte";

  // A 16:9 box the YouTube player moves over while this view is on screen.
  let el = $state<HTMLElement>();
  $effect(() => (el ? stage.claim(el) : undefined));
</script>

<div class="slot" bind:this={el} aria-hidden="true"></div>

<style>
  .slot {
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: var(--r-lg);
    background: rgb(0 0 0 / 0.5);
    box-shadow: var(--shadow-art);
  }
</style>
