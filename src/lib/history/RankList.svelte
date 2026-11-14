<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import type { Ranked } from "./recap";

  // A ranked list for the recap: each row carries a bar as long as its share of the leader's plays.
  // `art` shows covers (songs, albums); `onplay` makes rows playable.
  let { items, art = false, start = 1, onplay }: { items: Ranked[]; art?: boolean; start?: number; onplay?: (item: Ranked) => void } = $props();

  const most = $derived(Math.max(1, ...items.map((i) => i.plays)));
  const plays = (count: number) => (count === 1 ? "1 play" : `${count.toLocaleString()} plays`);
</script>

<ol class="rank" class:art {start}>
  {#each items as item, i (item.key)}
    <li style:--share={item.plays / most} style:--i={i}>
      <span class="place tabular">{start + i}</span>
      {#if art}
        {#if item.image}
          <img src={item.image} alt="" width="40" height="40" loading="lazy" decoding="async" />
        {:else}
          <span class="blank"><Icon name="note" size={16} /></span>
        {/if}
      {/if}
      <span class="text">
        <span class="name">{item.title}</span>
        {#if item.subtitle}<span class="by">{item.subtitle}</span>{/if}
      </span>
      <span class="plays tabular">{plays(item.plays)}</span>
      {#if onplay}
        <button class="play" onclick={() => onplay(item)} aria-label="Play {item.title}" title="Play"><Icon name="play" size={13} /></button>
      {/if}
    </li>
  {/each}
</ol>

<style>
  .rank {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  li {
    position: relative;
    isolation: isolate;
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-height: 44px;
    padding: var(--sp-1) var(--sp-2);
    border-radius: var(--r-md);
    overflow: hidden;
  }

  .art li {
    min-height: 52px;
  }

  /* The bar: full width, scaled to this row's share, so nothing but a transform sizes it. */
  li::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    background: linear-gradient(to right, var(--glass-active), var(--glass));
    transform: scaleX(var(--share, 0));
    transform-origin: left;
    animation: grow var(--dur-slow) var(--ease-out) backwards;
    animation-delay: calc(var(--i, 0) * 40ms);
  }

  @keyframes grow {
    from {
      transform: scaleX(0);
    }
  }

  .place {
    flex: none;
    width: 22px;
    color: var(--text-faint);
    font-size: var(--fs-small);
    text-align: right;
  }

  img,
  .blank {
    flex: none;
    width: 40px;
    height: 40px;
    border-radius: var(--r-art-sm);
    object-fit: cover;
  }

  .blank {
    display: grid;
    place-items: center;
    background: var(--glass-active);
    color: var(--text-faint);
  }

  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .name,
  .by {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .name {
    font-weight: 600;
  }

  .by {
    color: var(--text-muted);
    font-size: var(--fs-small);
  }

  .plays {
    flex: none;
    color: var(--text-muted);
    font-size: var(--fs-small);
  }

  .play {
    flex: none;
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    background: var(--paper);
    color: var(--ink);
    opacity: 0;
    transition:
      opacity var(--dur-fast),
      background var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  li:hover .play,
  .play:focus-visible {
    opacity: 1;
  }

  .play:hover {
    background: var(--accent);
    color: var(--accent-ink);
  }
</style>
