<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import SpotifyPlaylistCover from "$lib/components/SpotifyPlaylistCover.svelte";
  import { menu } from "$lib/menu.svelte";
  import { cardMenu } from "$lib/menus";
  import { player } from "$lib/player.svelte";
  import type { Card } from "$lib/spotify/types";
  import { pageHref } from "$lib/youtube/uri";

  // What was played lately (albums, playlists, artists) as compact tiles: two rows and a faded
  // third, the rest behind "Show more". `open` shows everything, for when Recent is the only shelf.
  let { title, cards, open = false }: { title: string; cards: Card[]; open?: boolean } = $props();

  const ROWS = 2;
  let grid = $state<HTMLElement>();
  let columns = $state(4);
  let expanded = $state(false);

  $effect(() => {
    const el = grid;
    if (!el) return;
    const count = () => (columns = Math.max(1, getComputedStyle(el).gridTemplateColumns.split(" ").length));
    const sizes = new ResizeObserver(count);
    sizes.observe(el);
    count();
    return () => sizes.disconnect();
  });

  const shownFirst = $derived(columns * ROWS);
  const more = $derived(cards.length > shownFirst);
  const folded = $derived(more && !open && !expanded);

  function play(event: MouseEvent, card: Card) {
    event.preventDefault();
    event.stopPropagation();
    if (player.contextUri === card.playUri) return void player.togglePlay();
    void player.playContext(card.playUri);
  }
</script>

{#if cards.length}
  <section class="recents">
    <h2>{title}</h2>
    <div class="grid" class:folded bind:this={grid}>
      {#each cards as card, i (card.kind + card.id)}
        {@const live = player.contextUri === card.playUri}
        <a
          class="tile pressable"
          class:live
          class:late={i >= shownFirst}
          href={card.kind === "track" ? undefined : pageHref(card.kind, card)}
          inert={folded && i >= shownFirst}
          style="--i: {Math.max(0, i - shownFirst)}"
          oncontextmenu={(e) => menu.open(e, cardMenu(card))}
        >
          <span class="art" class:round={card.kind === "artist"}>
            {#if card.uri.startsWith("spotify:playlist:")}
              <SpotifyPlaylistCover id={card.id} image={card.image} size={22} />
            {:else if card.image}
              <img src={card.image} alt="" width="56" height="56" loading="lazy" decoding="async" draggable="false" />
            {:else}
              <Icon name={card.kind === "artist" ? "artist" : "note"} size={22} />
            {/if}
          </span>
          <span class="text">
            <span class="name">{card.title}</span>
            <span class="sub">{card.subtitle}</span>
          </span>
          <button class="play" onclick={(e) => play(e, card)} aria-label="{live && !player.paused ? 'Pause' : 'Play'} {card.title}">
            <Icon name={live && !player.paused ? "pause" : "play"} size={14} />
          </button>
        </a>
      {/each}
    </div>
    {#if more && !open}
      <button class="pill ghost toggle" class:lifted={folded} onclick={() => (expanded = !expanded)} aria-expanded={expanded}>
        {expanded ? "Show less" : "Show more"}
        <span class="chevron" class:up={expanded}><Icon name="down" size={14} /></span>
      </button>
    {/if}
  </section>
{/if}

<style>
  .recents {
    --tile-h: 64px;
    margin-bottom: var(--sp-6);
  }

  h2 {
    margin-bottom: var(--sp-3);
    font-size: var(--fs-section);
    font-weight: 700;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(248px, 1fr));
    grid-auto-rows: var(--tile-h);
    gap: var(--sp-2);
  }

  /* Folded: two rows, then the top of a third fading out under the button. */
  .grid.folded {
    max-height: calc(var(--tile-h) * 2 + var(--sp-2) * 2 + 38px);
    overflow: hidden;
    mask-image: linear-gradient(to bottom, black calc(100% - 46px), transparent);
  }

  .tile {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-width: 0;
    padding-right: var(--sp-3);
    overflow: hidden;
    border-radius: var(--r-md);
    background: var(--plate);
    box-shadow: var(--rim);
    color: var(--text);
    text-decoration: none;
    transition:
      background var(--dur-fast),
      box-shadow var(--dur-med),
      translate var(--dur-spring) var(--ease-spring),
      transform var(--dur-spring) var(--ease-spring);
    --press: var(--press-wide);
  }

  .tile:hover,
  .tile:focus-within {
    background: var(--glass-active);
    box-shadow: var(--rim-hover);
    translate: 0 -2px;
    text-decoration: none;
  }

  /* Rows that "Show more" reveals rise in one after another. */
  .grid:not(.folded) .late {
    animation: rise 380ms var(--ease-out) backwards;
    animation-delay: calc(var(--i) * 22ms);
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
  }

  .art {
    flex: none;
    width: var(--tile-h);
    height: var(--tile-h);
    display: grid;
    place-items: center;
    overflow: hidden;
    background: var(--graphite-800);
    color: var(--text-faint);
  }

  .art.round {
    width: calc(var(--tile-h) - 12px);
    height: calc(var(--tile-h) - 12px);
    margin-left: 6px;
    border-radius: var(--r-pill);
  }

  .art img,
  .art :global(.cover) {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .name,
  .sub {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .name {
    font-weight: 650;
  }

  .live .name {
    color: var(--accent);
  }

  .sub {
    color: var(--text-muted);
    font-size: var(--fs-small);
  }

  /* Play arrives from the right under the pointer or the keyboard. */
  .play {
    flex: none;
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    background: var(--paper);
    color: var(--ink);
    opacity: 0;
    translate: 8px 0;
    transition:
      opacity var(--dur-fast),
      translate var(--dur-spring) var(--ease-spring),
      scale var(--dur-spring) var(--ease-spring),
      transform var(--dur-spring) var(--ease-spring);
  }

  .tile:hover .play,
  .tile:focus-within .play,
  .live .play {
    opacity: 1;
    translate: 0 0;
  }

  .play:hover {
    scale: 1.08;
  }

  .toggle {
    display: flex;
    margin: var(--sp-2) auto 0;
  }

  /* Over the fade, so the button sits on the row it will reveal. */
  .toggle.lifted {
    position: relative;
    margin-top: -20px;
    background: var(--glass-strong);
    box-shadow: var(--rim);
    color: var(--text);
  }

  .chevron {
    display: grid;
    transition: rotate var(--dur-med) var(--ease-out);
  }

  .chevron.up {
    rotate: 180deg;
  }
</style>
