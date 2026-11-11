<script lang="ts">
  import { artTones } from "$lib/art-tones.svelte";
  import { hold } from "$lib/hold";
  import { menu } from "$lib/menu.svelte";
  import { cardMenu } from "$lib/menus";
  import { player } from "$lib/player.svelte";
  import type { Card } from "$lib/spotify/types";
  import { css } from "$lib/wallpaper";
  import Icon from "./Icon.svelte";

  // An album, playlist, artist or song tile. Artwork is shown whole and untouched, so the play and
  // "…" buttons sit beside the caption, never on the art. `feature` sets it on a plate coloured
  // from the artwork, for a shelf's lead row.
  let { card, feature = false }: { card: Card; feature?: boolean } = $props();

  const href = $derived(card.kind === "track" ? null : `/${card.kind}/${card.id}`);
  const live = $derived(player.contextUri === card.playUri || player.isCurrent(card.playUri));
  const playing = $derived(live && !player.paused);
  const tones = artTones(() => (feature ? card.image : null));

  function play(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (live) return player.togglePlay();
    if (card.kind === "track") return player.playTracks([card.playUri]);
    player.playContext(card.playUri);
  }

  function openMenu(event: MouseEvent | KeyboardEvent) {
    event.preventDefault();
    menu.open(event, cardMenu(card));
  }
</script>

<svelte:element
  this={href ? "a" : "div"}
  {href}
  class="card"
  class:artist={card.kind === "artist"}
  class:feature
  class:live
  style={tones.current ? `--plate-tone: ${css(tones.current.fields[0])}` : undefined}
  oncontextmenu={openMenu}
  role={href ? undefined : "group"}
  aria-label={href ? undefined : card.title}
  use:hold={{ onhold: (at, node) => menu.openAt(at.x, at.y, cardMenu(card), node) }}
>
  <div class="art">
    {#if card.image}
      <img src={card.image} alt="" width="300" height="300" loading="lazy" decoding="async" draggable="false" />
    {:else}
      <div class="placeholder"><Icon name={card.kind === "artist" ? "artist" : "note"} size={34} /></div>
    {/if}
  </div>
  <div class="caption">
    <div class="text">
      <span class="title">{card.title}</span>
      {#if card.subtitle}<span class="subtitle">{card.subtitle}</span>{/if}
    </div>
    <div class="actions">
      <button class="act play" onclick={play} aria-label="{playing ? 'Pause' : 'Play'} {card.title}" title={playing ? "Pause" : "Play"}>
        <Icon name={playing ? "pause" : "play"} size={14} />
      </button>
      <button class="act" onclick={openMenu} aria-label="More options for {card.title}" aria-haspopup="menu" title="More">
        <Icon name="more" size={15} />
      </button>
    </div>
  </div>
</svelte:element>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    width: 100%;
    padding: var(--sp-2);
    border-radius: var(--r-lg);
    color: var(--text);
    text-decoration: none;
    transition:
      background var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
    --press: var(--press-wide);
  }

  /* Hover lifts the tile's surface, not the artwork. */
  .card:hover,
  .card:focus-within {
    background: var(--glass-hover);
    text-decoration: none;
  }

  .card:active:not(:has(.act:active)) {
    transform: scale(0.98);
    transition-duration: var(--dur-press);
  }

  .art {
    aspect-ratio: 1;
  }

  .art img,
  .placeholder {
    width: 100%;
    height: 100%;
    border-radius: var(--r-art);
    object-fit: cover;
    box-shadow: 0 12px 30px -16px rgb(0 0 0 / 0.9);
  }

  .artist .art img,
  .artist .placeholder {
    border-radius: var(--r-pill);
  }

  .placeholder {
    display: grid;
    place-items: center;
    background: var(--graphite-800);
    color: var(--text-faint);
  }

  .caption {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-2);
    min-width: 0;
    padding: 0 2px 2px;
  }

  .text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .title {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .live .title {
    color: var(--accent);
  }

  .subtitle {
    font-size: var(--fs-small);
    color: var(--text-muted);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .actions {
    display: flex;
    gap: 2px;
    margin-top: -3px;
    opacity: 0;
    transition: opacity var(--dur-fast);
  }

  .card:hover .actions,
  .card:focus-within .actions,
  .live .actions {
    opacity: 1;
  }

  .act {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    color: var(--text-muted);
    transition:
      background var(--dur-fast),
      color var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  .act:hover {
    background: var(--glass-active);
    color: var(--text);
  }

  .act.play {
    background: var(--paper);
    color: var(--ink);
  }

  .act.play:hover {
    background: var(--accent);
    color: var(--accent-ink);
  }

  /* Feature: the tile becomes a plate coloured from its own artwork. */
  .feature {
    --plate-tone: var(--graphite-900);
    padding: var(--sp-3) var(--sp-3) var(--sp-4);
    background: var(--plate-tone);
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.08);
    gap: var(--sp-4);
  }

  .feature:hover,
  .feature:focus-within {
    background: var(--plate-tone);
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.12),
      inset 0 0 0 100vmax rgb(255 255 255 / 0.05);
  }

  .feature .title {
    font-size: var(--fs-lead);
  }

  .feature .subtitle {
    color: rgb(255 255 255 / 0.7);
  }
</style>
