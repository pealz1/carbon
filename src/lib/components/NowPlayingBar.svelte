<script lang="ts">
  import { page } from "$app/state";
  import { DEFAULT_VOLUME } from "$lib/config";
  import { formatDuration } from "$lib/format";
  import { hasPage } from "$lib/local/tracks";
  import { pageHref } from "$lib/youtube/uri";
  import { player } from "$lib/player.svelte";
  import { view } from "$lib/view.svelte";
  import Icon from "./Icon.svelte";
  import LikeButton from "./LikeButton.svelte";
  import QueuePanel from "./QueuePanel.svelte";
  import Slider from "./Slider.svelte";
  import { specular } from "$lib/liquid";

  const TICK_MS = 250;
  let position = $state(0);
  let queueOpen = $state(false);
  const onNowPlaying = $derived(page.url.pathname === "/now-playing");

  $effect(() => {
    const timer = setInterval(() => (position = player.position()), TICK_MS);
    return () => clearInterval(timer);
  });
</script>

<section class="dock liquid" use:specular aria-label="Now playing">
  <div class="track">
    {#if player.track}
      <a href="/now-playing" class="art-link" aria-label="Open now playing">
        {#if player.track.album?.image}
          <img src={player.track.album.image} alt="" width="54" height="54" />
        {:else}
          <span class="art-blank"></span>
        {/if}
      </a>
      <div class="meta">
        {#if hasPage(player.track.album)}
          <a class="title" href={pageHref("album", player.track.album!)}>{player.track.name}</a>
        {:else}
          <span class="title">{player.track.name}</span>
        {/if}
        <span class="artists">
          {#each player.track.artists as artist, i (artist.uri)}
            {#if i > 0}{", "}{/if}{#if hasPage(artist)}<a href={pageHref("artist", artist)}>{artist.name}</a>{:else}{artist.name}{/if}
          {/each}
        </span>
      </div>
      <LikeButton uri={player.track.uri} label={player.track.name} size={17} />
    {:else}
      <span class="art-blank"></span>
      <div class="meta">
        <span class="title idle">{player.status === "ready" ? "Ready to play" : "Starting Carbon's player…"}</span>
        <span class="artists">Pick anything, or press play to resume</span>
      </div>
    {/if}
  </div>

  <div class="transport">
    <div class="buttons">
      <button class="small" class:on={player.shuffle} onclick={player.toggleShuffle} aria-label="Shuffle" aria-pressed={player.shuffle}>
        <Icon name="shuffle" size={17} />
      </button>
      <button class="small" onclick={player.previous} aria-label="Previous"><Icon name="prev" size={18} /></button>
      <button class="play" onclick={player.togglePlay} aria-label={player.paused ? "Play" : "Pause"}>
        <Icon name={player.paused ? "play" : "pause"} size={20} />
      </button>
      <button class="small" onclick={player.next} aria-label="Next"><Icon name="next" size={18} /></button>
      <button
        class="small repeat"
        class:on={player.repeat !== "off"}
        onclick={player.cycleRepeat}
        aria-label="Repeat: {player.repeat}"
        aria-pressed={player.repeat !== "off"}
      >
        <Icon name="repeat" size={17} />
        {#if player.repeat === "track"}<span class="one">1</span>{/if}
      </button>
    </div>
    <div class="seek">
      <span class="time tabular">{formatDuration(position)}</span>
      <Slider value={position} max={player.durationMs} step={1000} label="Seek" oncommit={player.seek} />
      <span class="time tabular">{formatDuration(player.durationMs)}</span>
    </div>
  </div>

  <div class="extras">
    <a class="small" class:on={onNowPlaying} href={onNowPlaying ? "/" : "/now-playing"} aria-label="Lyrics and now playing">
      <Icon name="lyrics" size={18} />
    </a>
    <button class="small" onclick={view.enterCinema} aria-label="Cinema mode" title="Cinema mode (Ctrl+Shift+C)">
      <Icon name="screen" size={18} />
    </button>
    <button class="small" class:on={queueOpen} onclick={() => (queueOpen = !queueOpen)} aria-label="Queue" aria-expanded={queueOpen}>
      <Icon name="queue" size={18} />
    </button>
    <button class="small" onclick={() => player.setVolume(player.volume > 0 ? 0 : DEFAULT_VOLUME)} aria-label={player.volume > 0 ? "Mute" : "Unmute"}>
      <Icon name={player.volume > 0 ? "volume" : "mute"} size={18} />
    </button>
    <div class="volume">
      <Slider value={player.volume} max={1} step={0.01} label="Volume" oncommit={player.setVolume} onpreview={player.setVolume} />
    </div>
  </div>
</section>

{#if queueOpen}
  <QueuePanel onclose={() => (queueOpen = false)} />
{/if}

<style>
  .dock {
    position: absolute;
    left: var(--sp-4);
    right: var(--sp-4);
    bottom: var(--sp-3);
    z-index: 5;
    height: var(--dock-h);
    display: grid;
    grid-template-columns: minmax(200px, 1fr) minmax(320px, 1.4fr) minmax(200px, 1fr);
    align-items: center;
    gap: var(--sp-4);
    padding: 0 var(--sp-4) 0 var(--sp-3);
    border-radius: var(--r-lg);
    --glass: var(--glass-strong);
    --glass-blur: var(--glass-blur-heavy);
    box-shadow: var(--shadow-float);
  }

  .track {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-width: 0;
  }

  .art-link img,
  .art-blank {
    width: 54px;
    height: 54px;
    border-radius: var(--r-md);
    object-fit: cover;
    box-shadow: 0 8px 22px -8px rgb(0 0 0 / 0.7);
    transition: transform var(--dur-med) var(--ease-spring);
  }

  .art-link:hover img {
    transform: scale(1.06);
  }

  .art-blank {
    display: block;
    flex: none;
    background: var(--glass-hover);
  }

  .meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .title {
    font-weight: 650;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .title.idle {
    color: var(--text-muted);
  }

  .artists {
    font-size: var(--fs-small);
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .transport {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .buttons {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: var(--sp-3);
  }

  .small {
    position: relative;
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    color: var(--text-muted);
    transition: color var(--dur-fast), background var(--dur-fast);
  }

  .small:hover {
    color: var(--text);
    background: var(--glass-hover);
    text-decoration: none;
  }

  .small.on {
    color: var(--accent);
  }

  .one {
    position: absolute;
    top: 5px;
    right: 4px;
    font-size: 9px;
    font-weight: 800;
  }

  .play {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    background: var(--text);
    color: var(--accent-ink);
    transition: transform var(--dur-fast) var(--ease-spring);
  }

  .play:hover {
    transform: scale(1.07);
  }

  .play:active {
    transform: scale(0.94);
  }

  .seek {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .time {
    width: 40px;
    font-size: var(--fs-micro);
    color: var(--text-faint);
    text-align: center;
  }

  .extras {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--sp-1);
  }

  .volume {
    width: 110px;
    display: flex;
  }
</style>
