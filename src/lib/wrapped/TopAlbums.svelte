<script lang="ts">
  import type { Top } from "$lib/history/wrapped";
  import Art from "./Art.svelte";
  import Rows from "./Rows.svelte";

  // The five most played albums: their covers as a mosaic (the first large, the rest in a row
  // under it; each whole and square, none overlapping), and their names beside it.
  let { albums }: { albums: Top[] } = $props();
</script>

<section class="top-albums">
  <div class="mosaic" aria-hidden="true">
    {#each albums as album, i (i)}
      <figure class="tile" class:first={i === 0} style:--i={i}><Art image={album.image} small={i > 0} /></figure>
    {/each}
  </div>
  <div class="list">
    <h2 class="title rise">Top albums</h2>
    <Rows items={albums} />
  </div>
</section>

<style>
  .top-albums {
    display: grid;
    grid-template-columns: calc(var(--art) * 0.86) minmax(0, 1fr);
    align-items: center;
    gap: var(--sp-7);
  }

  .mosaic {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--sp-2);
  }

  .tile {
    animation: arrive var(--dur-slow) var(--ease-out) backwards;
    animation-delay: calc(var(--i) * 110ms);
  }

  .tile.first {
    grid-column: 1 / -1;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    min-width: 0;
  }

  @keyframes arrive {
    from {
      opacity: 0;
      transform: scale(0.9);
    }
  }
</style>
