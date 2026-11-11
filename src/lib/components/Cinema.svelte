<script lang="ts">
  import { fade } from "svelte/transition";
  import { formatDuration } from "$lib/format";
  import { player } from "$lib/player.svelte";
  import { view } from "$lib/view.svelte";
  import Ambient from "./Ambient.svelte";
  import Icon from "./Icon.svelte";
  import LikeButton from "./LikeButton.svelte";
  import Lyrics from "./Lyrics.svelte";
  import Slider from "./Slider.svelte";

  // Immersive now playing: colour from the artwork (never the artwork blurred), big lyrics,
  // controls that step aside when idle.
  const IDLE_MS = 3_000;
  const TICK_MS = 250;
  let idle = $state(false);
  let position = $state(0);
  let root = $state<HTMLElement>();
  let timer = 0;

  function wake() {
    idle = false;
    clearTimeout(timer);
    timer = window.setTimeout(() => (idle = true), IDLE_MS);
  }

  $effect(() => {
    root?.focus();
    wake();
    const tick = setInterval(() => (position = player.position()), TICK_MS);
    return () => {
      clearTimeout(timer);
      clearInterval(tick);
    };
  });
</script>

<div
  bind:this={root}
  class="cinema"
  class:idle
  role="dialog"
  aria-modal="true"
  aria-label="Cinema mode"
  tabindex="-1"
  onpointermove={wake}
  onpointerdown={wake}
  onkeydown={wake}
  transition:fade={{ duration: 260 }}
>
  <Ambient image={player.artwork} playing={!player.paused} />

  {#if player.track}
    <div class="stage">
      <section class="art">
        {#if player.artwork}<img src={player.artwork} alt="" width="560" height="560" />{/if}
      </section>
      <Lyrics variant="cinema" />
    </div>
  {:else}
    <p class="empty">Play something to fill the screen.</p>
  {/if}

  <footer class="controls glass">
    {#if player.track}
      <div class="meta">
        <span class="title">{player.track.name}</span>
        <span class="artists">{player.track.artists.map((a) => a.name).join(", ")}</span>
      </div>
      <LikeButton uri={player.track.uri} label={player.track.name} size={20} />
    {/if}
    <div class="transport">
      <button onclick={player.previous} aria-label="Previous"><Icon name="prev" size={20} /></button>
      <button class="play" onclick={player.togglePlay} aria-label={player.paused ? "Play" : "Pause"}>
        <Icon name={player.paused ? "play" : "pause"} size={22} />
      </button>
      <button onclick={player.next} aria-label="Next"><Icon name="next" size={20} /></button>
    </div>
    <div class="seek">
      <span class="time tabular">{formatDuration(position)}</span>
      <Slider value={position} max={player.durationMs} step={1000} label="Seek" oncommit={player.seek} />
      <span class="time tabular">{formatDuration(player.durationMs)}</span>
    </div>
    <button onclick={view.toggleFullscreen} aria-label={view.fullscreen ? "Leave full screen" : "Full screen"} title="Full screen (F11)">
      <Icon name={view.fullscreen ? "collapse" : "expand"} size={18} />
    </button>
    <button onclick={view.exitCinema} aria-label="Leave cinema mode" title="Leave cinema mode (Esc)"><Icon name="close" size={18} /></button>
  </footer>
</div>

<style>
  .cinema {
    position: fixed;
    inset: 0;
    z-index: 40;
    overflow: hidden;
    background: var(--black);
    outline: none;
  }

  .cinema.idle {
    cursor: none;
  }

  .stage {
    position: relative;
    height: 100%;
    display: grid;
    grid-template-columns: minmax(260px, 0.8fr) minmax(0, 1.6fr);
    gap: var(--sp-7);
    align-items: center;
    padding: var(--sp-7) var(--sp-7) calc(var(--sp-7) + var(--player-h));
  }

  .art img {
    width: 100%;
    max-width: 560px;
    height: auto;
    aspect-ratio: 1;
    border-radius: var(--r-art);
    object-fit: cover;
    box-shadow: var(--shadow-art);
  }

  .stage :global(.lyrics) {
    height: 100%;
  }

  .empty {
    position: relative;
    display: grid;
    place-items: center;
    height: 100%;
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--fs-title);
    color: var(--text-muted);
  }

  .controls {
    position: absolute;
    left: 50%;
    bottom: var(--sp-5);
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    width: min(980px, calc(100% - 2 * var(--sp-5)));
    padding: var(--sp-3) var(--sp-4);
    border-radius: var(--r-pill);
    transform: translateX(-50%);
    transition:
      opacity var(--dur-med) var(--ease-out),
      transform var(--dur-med) var(--ease-out);
  }

  .idle .controls:not(:focus-within) {
    opacity: 0;
    transform: translate(-50%, 16px);
    pointer-events: none;
  }

  .meta {
    display: flex;
    flex-direction: column;
    min-width: 0;
    max-width: 220px;
  }

  .title,
  .artists {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .title {
    font-weight: 650;
  }

  .artists {
    font-size: var(--fs-small);
    color: var(--text-muted);
  }

  .transport {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .controls button {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    flex: none;
    border-radius: var(--r-pill);
    color: var(--text-muted);
    transition: color var(--dur-fast), background var(--dur-fast);
  }

  .controls button:hover {
    color: var(--text);
    background: var(--glass-hover);
  }

  .controls .play {
    width: 46px;
    height: 46px;
    background: var(--text);
    color: var(--accent-ink);
  }

  .controls .play:hover {
    background: var(--text);
    color: var(--accent-ink);
  }

  .seek {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-width: 160px;
  }

  .time {
    width: 40px;
    font-size: var(--fs-micro);
    color: var(--text-faint);
    text-align: center;
  }
</style>
