<script lang="ts">
  import type { Top } from "$lib/history/wrapped";
  import Plays from "./Plays.svelte";
  import Rows from "./Rows.svelte";

  // The most played artist, set in type (the history has no artist photos), and the four after.
  let { artists }: { artists: Top[] } = $props();

  const lead = $derived(artists[0]);
  const rest = $derived(artists.slice(1));
</script>

<section class="top-artists" class:alone={!rest.length}>
  <div class="lead">
    <h2 class="lead-in rise">The artist you played most</h2>
    <p class="name rise" style:--i={1}>{lead.title}</p>
    <p class="plays rise" style:--i={2}><Plays count={lead.plays} counting /></p>
  </div>
  {#if rest.length}<Rows items={rest} start={2} turn={3} />{/if}
</section>

<style>
  .top-artists {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    align-items: center;
    gap: var(--sp-7);
  }

  .top-artists.alone {
    grid-template-columns: minmax(0, 1fr);
  }

  .lead {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-width: 0;
  }

  /* The name is the picture here, so it takes the size a cover would. */
  .name {
    color: var(--tone);
    font-size: calc(var(--display) * 1.5);
    line-height: 0.98;
  }

  .plays {
    font-family: var(--font-display);
    font-size: var(--fs-hero);
    font-weight: 800;
    letter-spacing: var(--tracking-tight);
  }
</style>
