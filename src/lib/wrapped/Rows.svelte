<script lang="ts">
  import type { Top } from "$lib/history/wrapped";
  import Art from "./Art.svelte";
  import Plays from "./Plays.svelte";

  // A ranked list on a slide: place, cover (with `art`), name and plays. Rows rise in one after
  // another; `turn` is the first row's place in its slide's order of entrances.
  let { items, start = 1, art = false, turn = 1 }: { items: Top[]; start?: number; art?: boolean; turn?: number } = $props();
</script>

<ol class="rows" {start}>
  {#each items as item, i (i)}
    <li class="rise" class:first={start + i === 1} style:--i={turn + i}>
      <span class="place tabular">{start + i}</span>
      {#if art}<span class="cover"><Art image={item.image} small /></span>{/if}
      <span class="text">
        <span class="what clip">{item.title}</span>
        {#if item.subtitle}<span class="by clip">{item.subtitle}</span>{/if}
      </span>
      <span class="plays"><Plays count={item.plays} /></span>
    </li>
  {/each}
</ol>

<style>
  .rows {
    list-style: none;
    padding: 0;
  }

  li {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    padding: var(--sp-3) 0;
    border-top: 1px solid var(--glass-edge);
  }

  li:first-child {
    border-top: 0;
  }

  .place {
    flex: none;
    width: 1.2em;
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--fs-hero);
    font-weight: 800;
    line-height: 1;
    letter-spacing: var(--tracking-tight);
  }

  .first .place {
    color: var(--tone);
  }

  .cover {
    flex: none;
    width: var(--thumb);
  }

  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .what {
    font-family: var(--font-display);
    font-size: var(--fs-section);
    font-weight: 700;
    letter-spacing: var(--tracking-tight);
  }

  .by,
  .plays {
    color: var(--text-muted);
  }

  .plays {
    flex: none;
    font-size: var(--fs-lead);
  }
</style>
