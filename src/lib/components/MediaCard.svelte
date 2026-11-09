<script lang="ts">
  import { player } from "$lib/player.svelte";
  import type { Card } from "$lib/spotify/types";
  import Icon from "./Icon.svelte";

  let { card }: { card: Card } = $props();

  const href = $derived(card.kind === "track" ? null : `/${card.kind}/${card.id}`);
  const live = $derived(player.contextUri === card.playUri || player.isCurrent(card.playUri));

  function play(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (live) return player.togglePlay();
    if (card.kind === "track") return player.playTracks([card.playUri]);
    player.playContext(card.playUri);
  }
</script>

<svelte:element this={href ? "a" : "div"} {href} class="card" class:artist={card.kind === "artist"}>
  <div class="art">
    {#if card.image}
      <img src={card.image} alt="" width="300" height="300" loading="lazy" decoding="async" />
    {:else}
      <div class="placeholder"><Icon name={card.kind === "artist" ? "library" : "lyrics"} size={30} /></div>
    {/if}
    <button class="play" class:live onclick={play} aria-label="{live && !player.paused ? 'Pause' : 'Play'} {card.title}">
      <Icon name={live && !player.paused ? "pause" : "play"} size={18} />
    </button>
  </div>
  <span class="title">{card.title}</span>
  <span class="subtitle">{card.subtitle}</span>
</svelte:element>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    width: 100%;
    padding: var(--sp-2);
    border-radius: var(--r-md);
    text-decoration: none;
    transition: background var(--dur-med);
  }

  .card:hover {
    background: var(--glass-hover);
    text-decoration: none;
  }

  .art {
    position: relative;
    aspect-ratio: 1;
    margin-bottom: var(--sp-2);
  }

  .art img,
  .placeholder {
    width: 100%;
    height: 100%;
    border-radius: var(--r-md);
    object-fit: cover;
    box-shadow: 0 14px 34px -14px rgb(0 0 0 / 0.75);
    transition: transform var(--dur-med) var(--ease-out);
  }

  .card:hover .art img {
    transform: translateY(-3px) scale(1.02);
  }

  .artist .art img,
  .artist .placeholder {
    border-radius: var(--r-pill);
  }

  .placeholder {
    display: grid;
    place-items: center;
    background: var(--glass-active);
    color: var(--text-faint);
  }

  .play {
    position: absolute;
    right: var(--sp-2);
    bottom: var(--sp-2);
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    background: var(--accent);
    color: var(--accent-ink);
    box-shadow: 0 10px 24px -8px var(--accent-glow);
    opacity: 0;
    transform: translateY(8px);
    transition: opacity var(--dur-med) var(--ease-out), transform var(--dur-med) var(--ease-spring);
  }

  .card:hover .play,
  .play:focus-visible,
  .play.live {
    opacity: 1;
    transform: translateY(0);
  }

  .play:hover {
    transform: scale(1.06);
  }

  .title {
    font-weight: 650;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
</style>
