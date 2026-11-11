<script lang="ts">
  import type { Snippet } from "svelte";
  import type { Card } from "$lib/spotify/types";
  import Icon from "./Icon.svelte";
  import MediaCard from "./MediaCard.svelte";

  // A titled row of cards that scrolls sideways with its own buttons, or a wrapping grid.
  let {
    title,
    cards,
    wrap = false,
    feature = false,
    action,
  }: { title: string; cards: Card[]; wrap?: boolean; feature?: boolean; action?: Snippet } = $props();

  let row = $state<HTMLElement>();
  let atStart = $state(true);
  let atEnd = $state(false);
  let frame = 0;

  const measure = () => {
    frame = 0;
    if (!row) return;
    atStart = row.scrollLeft < 4;
    atEnd = row.scrollLeft + row.clientWidth >= row.scrollWidth - 4;
  };
  const onScroll = () => (frame ||= requestAnimationFrame(measure));

  $effect(() => {
    void cards.length;
    if (!row) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  });

  /** Pages by most of a screenful, so the last card seen stays in view. */
  const page = (direction: 1 | -1) => row?.scrollBy({ left: direction * row.clientWidth * 0.85, behavior: "smooth" });
</script>

{#if cards.length}
  <section class="shelf" class:feature>
    <header>
      <h2>{title}</h2>
      {@render action?.()}
      {#if !wrap}
        <div class="pager">
          <button onclick={() => page(-1)} disabled={atStart} aria-label="Scroll {title} back" title="Back"><Icon name="back" size={16} /></button>
          <button onclick={() => page(1)} disabled={atEnd} aria-label="Scroll {title} forward" title="Forward"><Icon name="forward" size={16} /></button>
        </div>
      {/if}
    </header>
    <div class="cards" class:wrap bind:this={row} onscroll={onScroll}>
      {#each cards as card (card.kind + card.id)}
        <MediaCard {card} {feature} />
      {/each}
    </div>
  </section>
{/if}

<style>
  .shelf {
    --card-w: clamp(168px, 14cqw, 244px);
    margin-bottom: var(--sp-6);
  }

  .feature {
    --card-w: clamp(196px, 17cqw, 288px);
  }

  header {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    margin-bottom: var(--sp-3);
  }

  h2 {
    flex: 1;
    font-size: var(--fs-section);
    font-weight: 700;
  }

  .pager {
    display: flex;
    gap: var(--sp-2);
  }

  .pager button {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    background: var(--glass);
    color: var(--text);
    transition:
      background var(--dur-fast),
      opacity var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  .pager button:hover:not(:disabled) {
    background: var(--glass-active);
  }

  .pager button:disabled {
    opacity: 0.35;
    cursor: default;
  }

  /* Cards bleed to the stage edge so the row reads as continuing. */
  .cards {
    /* A card's padding is its hover surface; pull it out so the artwork lines up with the title. */
    --edge: calc(var(--page-x, 0px) - var(--sp-2));
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: var(--card-w);
    gap: var(--sp-2);
    margin: 0 calc(var(--page-x, 0px) * -1);
    padding: 0 var(--edge);
    scroll-padding: 0 var(--edge);
    overflow-x: auto;
    scroll-snap-type: x proximity;
    scrollbar-width: none;
  }

  .cards > :global(*) {
    scroll-snap-align: start;
  }

  .cards.wrap {
    grid-auto-flow: row;
    grid-template-columns: repeat(auto-fill, minmax(min(var(--card-w), 100%), 1fr));
    margin: 0 calc(var(--sp-2) * -1);
    padding: 0;
    overflow: visible;
  }

  .feature .cards {
    --edge: var(--page-x, 0px);
    gap: var(--sp-4);
  }
</style>
