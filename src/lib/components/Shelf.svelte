<script lang="ts">
  import type { Snippet } from "svelte";
  import type { Card } from "$lib/spotify/types";
  import MediaCard from "./MediaCard.svelte";

  let { title, cards, wrap = false, action }: { title: string; cards: Card[]; wrap?: boolean; action?: Snippet } = $props();
</script>

{#if cards.length}
  <section class="shelf">
    <header>
      <h2>{title}</h2>
      {@render action?.()}
    </header>
    <div class="cards" class:wrap>
      {#each cards as card (card.kind + card.id)}
        <MediaCard {card} />
      {/each}
    </div>
  </section>
{/if}

<style>
  .shelf {
    margin-bottom: var(--sp-6);
  }

  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin: 0 var(--sp-2) var(--sp-3);
  }

  h2 {
    font-size: var(--fs-section);
  }

  .cards {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 176px;
    gap: var(--sp-2);
    overflow-x: auto;
    padding-bottom: var(--sp-2);
    scroll-snap-type: x proximity;
  }

  .cards > :global(*) {
    scroll-snap-align: start;
  }

  .cards.wrap {
    grid-auto-flow: row;
    grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
    overflow: visible;
  }
</style>
