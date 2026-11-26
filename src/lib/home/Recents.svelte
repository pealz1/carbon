<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import SpotifyPlaylistCover from "$lib/components/SpotifyPlaylistCover.svelte";
  import { menu } from "$lib/menu.svelte";
  import { cardMenu } from "$lib/menus";
  import { player } from "$lib/player.svelte";
  import type { Card } from "$lib/spotify/types";
  import { pageHref } from "$lib/youtube/uri";

  let { title, cards, open = false }: { title: string; cards: Card[]; open?: boolean } = $props();
  let row = $state<HTMLElement>();
  let atStart = $state(true);
  let atEnd = $state(false);
  const rows = $derived(Math.min(cards.length, 3));

  function measure() {
    if (!row) return;
    atStart = row.scrollLeft < 4;
    atEnd = row.scrollLeft + row.clientWidth >= row.scrollWidth - 4;
  }

  $effect(() => {
    void cards.length;
    if (!row) return;
    const resize = new ResizeObserver(measure);
    resize.observe(row);
    measure();
    return () => resize.disconnect();
  });

  const shift = (direction: number) => row?.scrollBy({ left: direction * row.clientWidth * 0.9, behavior: "smooth" });
  function play(card: Card) {
    if (player.contextUri === card.playUri) return void player.togglePlay();
    void player.playContext(card.playUri);
  }
</script>

{#if cards.length}
  <section class="recents">
    <header>
      <h2>{title}</h2>
      {#if !open}
        <div class="arrows">
          <button onclick={() => shift(-1)} disabled={atStart} aria-label="Scroll {title} back"><Icon name="back" size={15} /></button>
          <button onclick={() => shift(1)} disabled={atEnd} aria-label="Scroll {title} forward"><Icon name="forward" size={15} /></button>
        </div>
      {/if}
    </header>
    <ul class:open bind:this={row} onscroll={measure} style:--rows={rows}>
      {#each cards as card (card.kind + card.id)}
        {@const live = player.contextUri === card.playUri}
        <li class:live>
          <a class="tile" href={card.kind === "track" ? undefined : pageHref(card.kind, card)} oncontextmenu={(e) => menu.open(e, cardMenu(card))}>
            <span class="art" class:round={card.kind === "artist"}>
              {#if card.uri.startsWith("spotify:playlist:")}
                <SpotifyPlaylistCover id={card.id} image={card.image} size={20} />
              {:else if card.image}
                <img src={card.image} alt="" width="42" height="42" loading="lazy" decoding="async" draggable="false" />
              {:else}
                <Icon name={card.kind === "artist" ? "artist" : "note"} size={19} />
              {/if}
            </span>
            <span class="text">
              <span class="name">{card.title}</span>
              <span class="sub">{card.subtitle}</span>
            </span>
          </a>
          <button class="play" onclick={() => play(card)} aria-label="{live && !player.paused ? 'Pause' : 'Play'} {card.title}">
            <Icon name={live && !player.paused ? "pause" : "play"} size={18} />
          </button>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .recents { margin-bottom: var(--sp-6); }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--sp-2); }
  h2 { font-size: var(--fs-section); font-weight: 700; }
  .arrows { display: flex; gap: var(--sp-2); }
  .arrows button, .play {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: var(--r-pill);
  }
  .arrows button { box-shadow: inset 0 0 0 1px var(--glass-edge); }
  .arrows button:not(:disabled):hover, .play:hover { background: var(--glass-active); }
  .arrows button:disabled { opacity: 0.45; cursor: default; }
  ul {
    display: grid;
    grid-template-rows: repeat(var(--rows), 60px);
    grid-auto-flow: column;
    grid-auto-columns: max(300px, calc((100% - var(--sp-4)) / 2));
    gap: 2px var(--sp-4);
    padding: 0;
    margin: 0;
    overflow-x: auto;
    scrollbar-width: none;
    list-style: none;
    scroll-snap-type: x proximity;
  }
  ul.open {
    grid-template-rows: none;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
    grid-auto-flow: row;
    grid-auto-rows: 60px;
    overflow: visible;
  }
  li {
    min-width: 0;
    display: flex;
    align-items: center;
    padding-right: var(--sp-2);
    overflow: hidden;
    border-radius: var(--r-md);
    scroll-snap-align: start;
  }
  li:nth-child(odd) { background: var(--plate); }
  li:hover, li:focus-within { background: var(--glass-hover); }
  .tile {
    display: flex;
    flex: 1;
    align-items: center;
    gap: var(--sp-3);
    min-width: 0;
    padding: var(--sp-2) var(--sp-3);
    text-decoration: none;
  }
  .art {
    flex: none;
    display: grid;
    width: 42px;
    height: 42px;
    place-items: center;
    overflow: hidden;
    border-radius: var(--r-sm);
    background: var(--plate);
    color: var(--text-muted);
  }
  .art.round { border-radius: var(--r-pill); }
  .art img, .art :global(.cover) { width: 100%; height: 100%; object-fit: cover; }
  .text { min-width: 0; display: grid; gap: 2px; }
  .name, .sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .name { font-weight: 650; }
  .live .name { color: var(--accent); }
  .sub { color: var(--text-muted); font-size: var(--fs-small); }
  .play { flex: none; color: var(--text); opacity: 0; }
  li:hover .play, li:focus-within .play, li.live .play { opacity: 1; }
  @media (hover: none) { .play { opacity: 1; } }
  @container stage (max-width: 760px) { ul:not(.open) { grid-auto-columns: 100%; } }
</style>
