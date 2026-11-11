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
  import Logo from "./Logo.svelte";
  import Slider from "./Slider.svelte";

  // The player bar: part of the chrome, no card. Track on the left, progress over transport in
  // the middle, the room's controls on the right.
  const TICK_MS = 250;
  let position = $state(0);
  const onNowPlaying = $derived(page.url.pathname === "/now-playing");
  const remaining = $derived(Math.max(0, player.durationMs - position));

  $effect(() => {
    const timer = setInterval(() => (position = player.position()), TICK_MS);
    return () => clearInterval(timer);
  });
</script>

<section class="player" aria-label="Now playing">
  <div class="track">
    {#if player.track}
      {@const album = player.track.album}
      <a href="/now-playing" class="art" aria-label="Open now playing">
        {#if album?.image}
          <img src={album.image} alt="" width="60" height="60" />
        {:else}
          <span class="blank"><Icon name="note" size={22} /></span>
        {/if}
      </a>
      <div class="meta">
        {#if hasPage(album)}
          <a class="title" href={pageHref("album", album!)}>{player.track.name}</a>
        {:else}
          <span class="title">{player.track.name}</span>
        {/if}
        <span class="sub">
          {#each player.track.artists as artist, i (artist.uri)}
            {#if i > 0}{", "}{/if}{#if hasPage(artist)}<a href={pageHref("artist", artist)}>{artist.name}</a>{:else}{artist.name}{/if}
          {/each}
          {#if album?.name}<span class="dash">–</span>{album.name}{/if}
        </span>
      </div>
      <LikeButton uri={player.track.uri} label={player.track.name} size={17} />
    {:else}
      <span class="blank idle"><Logo size={24} /></span>
      <div class="meta">
        <span class="title">{player.status === "connecting" ? "Starting Carbon's player…" : "Nothing playing"}</span>
        <span class="sub">Pick anything, or press play to resume</span>
      </div>
    {/if}
  </div>

  <div class="center">
    <div class="seek">
      <span class="time tabular">{formatDuration(position)}</span>
      <Slider value={position} max={player.durationMs} step={1000} tone="accent" label="Seek" valuetext="{formatDuration(position)} of {formatDuration(player.durationMs)}" oncommit={player.seek} />
      <span class="time tabular">−{formatDuration(remaining)}</span>
    </div>
    <div class="transport">
      <button class="ctl" class:on={player.shuffle} onclick={player.toggleShuffle} aria-label="Shuffle" aria-pressed={player.shuffle} title="Shuffle">
        <Icon name="shuffle" size={18} />
      </button>
      <button class="ctl" onclick={player.previous} aria-label="Previous" title="Previous"><Icon name="prev" size={20} /></button>
      <button class="ctl play" onclick={player.togglePlay} aria-label={player.paused ? "Play" : "Pause"}>
        <Icon name={player.paused ? "play" : "pause"} size={26} />
      </button>
      <button class="ctl" onclick={player.next} aria-label="Next" title="Next"><Icon name="next" size={20} /></button>
      <button
        class="ctl repeat"
        class:on={player.repeat !== "off"}
        onclick={player.cycleRepeat}
        aria-label="Repeat: {player.repeat}"
        aria-pressed={player.repeat !== "off"}
        title="Repeat"
      >
        <Icon name="repeat" size={18} />
        {#if player.repeat === "track"}<span class="one">1</span>{/if}
      </button>
    </div>
  </div>

  <div class="extras">
    <a class="ctl" class:on={onNowPlaying} href={onNowPlaying ? "/" : "/now-playing"} aria-label="Now playing" title="Now playing">
      <Icon name="album" size={18} />
    </a>
    <button class="ctl" onclick={view.enterCinema} aria-label="Cinema mode" title="Cinema mode (Ctrl+Shift+C)">
      <Icon name="screen" size={18} />
    </button>
    <button class="ctl" onclick={() => player.setVolume(player.volume > 0 ? 0 : DEFAULT_VOLUME)} aria-label={player.volume > 0 ? "Mute" : "Unmute"} title={player.volume > 0 ? "Mute" : "Unmute"}>
      <Icon name={player.volume > 0 ? "volume" : "mute"} size={18} />
    </button>
    <div class="volume">
      <Slider value={player.volume} max={1} step={0.01} label="Volume" valuetext="{Math.round(player.volume * 100)}%" oncommit={player.setVolume} onpreview={player.setVolume} />
    </div>
  </div>
</section>

<style>
  .player {
    grid-area: player;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(320px, 620px) minmax(0, 1fr);
    align-items: center;
    gap: var(--sp-5);
    padding: 0 var(--sp-5) var(--sp-1) var(--sp-4);
    color: var(--chrome-text);
  }

  .track {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-width: 0;
  }

  .art {
    flex: none;
    border-radius: var(--r-art-sm);
  }

  .art img,
  .blank {
    width: 60px;
    height: 60px;
    border-radius: var(--r-art-sm);
    object-fit: cover;
  }

  .art img {
    box-shadow: 0 8px 24px -10px rgb(0 0 0 / 0.8);
  }

  .blank {
    display: grid;
    flex: none;
    place-items: center;
    background: var(--chrome-field);
    color: var(--chrome-text-muted);
  }

  .meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .title,
  .sub {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .title {
    font-size: var(--fs-lead);
    font-weight: 600;
  }

  .sub {
    font-size: var(--fs-small);
    color: var(--chrome-text-muted);
  }

  .dash {
    margin: 0 0.35em;
  }

  .center {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .seek {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
  }

  .time {
    width: 42px;
    font-size: var(--fs-caption);
    color: var(--chrome-text-muted);
  }

  .time:first-child {
    text-align: right;
  }

  .transport {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: var(--sp-3);
  }

  .ctl {
    position: relative;
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    color: var(--chrome-text-muted);
    transition:
      color var(--dur-fast),
      background var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  .ctl:hover {
    color: var(--chrome-text);
    background: var(--chrome-hover);
    text-decoration: none;
  }

  .ctl.on {
    color: var(--accent);
  }

  .play {
    width: 44px;
    height: 44px;
    color: var(--chrome-text);
  }

  .one {
    position: absolute;
    top: 6px;
    right: 5px;
    font-size: 9px;
    font-weight: 800;
  }

  .extras {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 2px;
  }

  .volume {
    width: 104px;
    display: flex;
    margin-left: var(--sp-1);
  }

  @media (max-width: 1100px) {
    .player {
      grid-template-columns: minmax(0, 1fr) minmax(280px, 1.2fr) auto;
      gap: var(--sp-4);
    }

    .volume {
      width: 72px;
    }
  }
</style>
