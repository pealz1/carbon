<script lang="ts">
  import type { Snippet } from "svelte";
  import { artTones } from "$lib/art-tones.svelte";
  import { clockTime, endsAt, queueEndsAt } from "$lib/cinema";
  import { formatDuration } from "$lib/format";
  import { hold } from "$lib/hold";
  import { hasPage, isLocalUri } from "$lib/local/tracks";
  import type { LyricLine } from "$lib/lrc";
  import { menu } from "$lib/menu.svelte";
  import { addToPlaylistItems, trackMenu } from "$lib/menus";
  import type { CinemaLayout } from "$lib/native";
  import { player } from "$lib/player.svelte";
  import { prefs } from "$lib/preferences.svelte";
  import { resource } from "$lib/resource.svelte";
  import { services } from "$lib/services.svelte";
  import * as sp from "$lib/spotify/endpoints";
  import { view } from "$lib/view.svelte";
  import { css } from "$lib/wallpaper";
  import { addToPlaylistItems as youtubePlaylistItems } from "$lib/youtube/menus";
  import { isYoutubeUri, pageHref } from "$lib/youtube/uri";
  import BarPopover from "./BarPopover.svelte";
  import CinemaLayouts from "./CinemaLayouts.svelte";
  import Icon from "./Icon.svelte";
  import LikeButton from "./LikeButton.svelte";
  import LyricScrubber from "./LyricScrubber.svelte";
  import LyricsControls from "./LyricsControls.svelte";
  import PlaybackTools from "./PlaybackTools.svelte";
  import UpNext from "./UpNext.svelte";
  import VolumeControl from "./VolumeControl.svelte";

  // Cinema's floating bar: the song (with its source), progress that knows the lyrics, transport,
  // and the room's controls. It steps aside when idle; `onhold` keeps it up while it's in use.
  let {
    hidden,
    lines,
    shiftMs,
    offset = $bindable(0),
    height = $bindable(0),
    onhold,
    miniPlayer,
  }: {
    hidden: boolean;
    lines: LyricLine[];
    shiftMs: number;
    offset?: number;
    height?: number;
    onhold: (reason: string, on: boolean) => void;
    /** The mini player's button, once Carbon has one (nothing is drawn until then). */
    miniPlayer?: Snippet;
  } = $props();

  const TICK_MS = 250;
  const SOURCES = { spotify: "Spotify", youtube: "YouTube Music", local: "On this PC" } as const;
  const OPEN_POPOVER = "[aria-expanded='true']";
  let bar = $state<HTMLElement>();
  let position = $state(player.position());
  let now = $state(Date.now());
  let queueMode = $state(false);

  $effect(() => {
    const timer = setInterval(() => ((position = player.position()), (now = Date.now())), TICK_MS);
    return () => clearInterval(timer);
  });
  // Any popover opened from the bar (its own, the sleep timer's, the devices') keeps it up.
  $effect(() => {
    const root = bar;
    if (!root) return;
    const observer = new MutationObserver(() => onhold("popover", root.querySelector(OPEN_POPOVER) !== null));
    observer.observe(root, { attributes: true, attributeFilter: ["aria-expanded"], subtree: true });
    return () => observer.disconnect();
  });

  // Carbon and YouTube Music queues are known exactly; Spotify's is asked for once per song, as the queue panel does.
  const spotifyQueue = resource(() => {
    void player.track?.uri;
    return player.upNext === null && player.source === "spotify" && services.active.spotify ? sp.queue() : Promise.resolve([]);
  });
  const upNext = $derived(player.upNext ?? spotifyQueue.data ?? []);
  const exactQueue = $derived(player.upNext !== null && upNext.length > 0);
  const showQueueEnd = $derived(queueMode && exactQueue);
  const ends = $derived(showQueueEnd ? queueEndsAt(now, position, player.durationMs, upNext) : endsAt(now, position, player.durationMs));
  const remaining = $derived(Math.max(0, player.durationMs - position));

  const tones = artTones(() => player.artwork);
  const tint = $derived(tones.current ? `--tint-a: ${css(tones.current.wash, 0.4)}; --tint-b: ${css(tones.current.wash2, 0.26)}` : "");

  function addToPlaylist(event: MouseEvent) {
    const track = player.track;
    if (track) menu.open(event, isYoutubeUri(track.uri) ? youtubePlaylistItems([track.id]) : addToPlaylistItems([track.uri]));
  }

  const trackItems = () => (player.track ? trackMenu(player.track) : []);
  const holdMenu = { onhold: (at: { x: number; y: number }, node: HTMLElement) => menu.openAt(at.x, at.y, trackItems(), node) };
  // Keyboard focus holds the bar up; a click's focus doesn't, or one click would pin it for good.
  const focusIn = (event: FocusEvent) => onhold("focus", (event.target as Element).matches(":focus-visible"));
  const focusOut = (event: FocusEvent) => !bar?.contains(event.relatedTarget as Node | null) && onhold("focus", false);
</script>

<footer
  bind:this={bar}
  bind:offsetHeight={height}
  class="bar"
  class:hidden
  style={tint}
  aria-label="Player"
  onpointerenter={() => onhold("hover", true)}
  onpointerleave={() => onhold("hover", false)}
  onfocusin={focusIn}
  onfocusout={focusOut}
>
  <div class="seek">
    <span class="time tabular">{formatDuration(position)}</span>
    <LyricScrubber {position} durationMs={player.durationMs} {lines} {shiftMs} onseek={player.seek} />
    <span class="time tabular">−{formatDuration(remaining)}</span>
    {#if player.track && player.durationMs > 0}
      <button
        class="ends tabular"
        onclick={() => (queueMode = !queueMode)}
        disabled={!exactQueue}
        aria-pressed={showQueueEnd}
        title={exactQueue ? (showQueueEnd ? "Show when this song ends" : "Show when the queue ends") : undefined}
      >
        <Icon name="clock" size={14} />{showQueueEnd ? "Queue ends" : "Ends"}
        {clockTime(ends)}
      </button>
    {/if}
  </div>

  <div class="row">
    <div class="now" role="group" aria-label="Now playing" use:hold={holdMenu} oncontextmenu={(e) => menu.open(e, trackItems())}>
      {#if player.track}
        {@const track = player.track}
        {@const album = track.album}
        {#if album?.image}
          <img class="thumb" src={album.image} alt="" width="48" height="48" />
        {:else}
          <span class="thumb blank"><Icon name="note" size={20} /></span>
        {/if}
        <div class="meta">
          <span class="line">
            {#if hasPage(album)}<a class="title" href={pageHref("album", album!)}>{track.name}</a>{:else}<span class="title">{track.name}</span>{/if}
            <span class="badge {player.source}">{SOURCES[player.source]}</span>
          </span>
          <span class="sub">
            {#each track.artists as artist, i (artist.uri + i)}
              {#if i > 0}{", "}{/if}{#if hasPage(artist)}<a href={pageHref("artist", artist)}>{artist.name}</a>{:else}{artist.name}{/if}
            {/each}
            {#if album?.name}<span class="dash">—</span>{#if hasPage(album)}<a href={pageHref("album", album!)}>{album.name}</a>{:else}{album.name}{/if}{/if}
          </span>
        </div>
        <LikeButton uri={track.uri} label={track.name} size={18} />
        {#if !isLocalUri(track.uri)}
          <button class="ctl" onclick={addToPlaylist} aria-label="Add {track.name} to a playlist" title="Add to playlist"><Icon name="listAdd" size={18} /></button>
        {/if}
      {:else}
        <span class="sub">Nothing playing</span>
      {/if}
    </div>

    <div class="transport">
      <button class="ctl" class:on={player.shuffle} onclick={player.toggleShuffle} aria-label="Shuffle" aria-pressed={player.shuffle} title="Shuffle">
        <Icon name="shuffle" size={18} />
      </button>
      <button class="ctl" onclick={player.previous} aria-label="Previous" title="Previous"><Icon name="prev" size={20} /></button>
      <button class="play" onclick={player.togglePlay} aria-label={player.paused ? "Play" : "Pause"} title={player.paused ? "Play" : "Pause"}>
        <Icon name={player.paused ? "play" : "pause"} size={22} />
      </button>
      <button class="ctl" onclick={player.next} aria-label="Next" title="Next"><Icon name="next" size={20} /></button>
      <button class="ctl" class:on={player.repeat !== "off"} onclick={player.cycleRepeat} aria-label="Repeat: {player.repeat}" aria-pressed={player.repeat !== "off"} title="Repeat">
        <Icon name="repeat" size={18} />
        {#if player.repeat === "track"}<span class="one">1</span>{/if}
      </button>
    </div>

    <div class="tools">
      {#if upNext.length}<UpNext tracks={upNext} exact={exactQueue} />{/if}
      <LyricsControls bind:offset synced={lines.length > 0} />
      <BarPopover label="Layout">
        {#snippet button()}<Icon name="layouts" size={18} />{/snippet}
        <div class="layouts"><CinemaLayouts value={prefs.value?.cinemaLayout ?? "split"} onpick={(cinemaLayout: CinemaLayout) => prefs.update({ cinemaLayout })} /></div>
      </BarPopover>
      <PlaybackTools />
      {@render miniPlayer?.()}
      <VolumeControl />
      <span class="rule" aria-hidden="true"></span>
      <button class="ctl" onclick={view.toggleFullscreen} aria-label={view.fullscreen ? "Leave full screen" : "Full screen"} title="Full screen (F11)">
        <Icon name={view.fullscreen ? "collapse" : "expand"} size={18} />
      </button>
      <button class="ctl" onclick={view.exitCinema} aria-label="Leave cinema mode" title="Leave cinema mode (Esc)"><Icon name="close" size={18} /></button>
    </div>
  </div>
</footer>

<style>
  /* While showing, the bar has no transform, filter or containment: the player bar's popovers
     (sleep timer, devices) are fixed to the window and would otherwise be placed against the bar. */
  .bar {
    --tint-a: transparent;
    --tint-b: transparent;
    --seek-h: 24px;
    position: absolute;
    left: 0;
    right: 0;
    bottom: var(--sp-4);
    z-index: 2;
    isolation: isolate;
    width: min(1360px, calc(100% - 2 * var(--sp-5)));
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0 auto;
    padding: var(--sp-2) var(--sp-6) var(--sp-3);
    border-radius: var(--r-pill);
    transition:
      opacity var(--dur-med) var(--ease-out),
      transform var(--dur-med) var(--ease-out);
  }

  /* The glass, tinted by the artwork's tones. */
  .bar::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    background: var(--grain), linear-gradient(100deg, var(--tint-a), var(--tint-b)), var(--glass-strong);
    backdrop-filter: var(--glass-blur);
    box-shadow: var(--glass-shadow);
    pointer-events: none;
  }

  .bar.hidden {
    opacity: 0;
    transform: translateY(24px);
    pointer-events: none;
    transition-duration: var(--dur-slow);
  }

  .seek {
    height: var(--seek-h);
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: 0 var(--sp-2);
  }

  .time {
    min-width: 40px;
    font-size: var(--fs-caption);
    color: var(--text-muted);
  }

  .time:first-child {
    text-align: right;
  }

  .ends {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 24px;
    padding: 0 var(--sp-2);
    border-radius: var(--r-pill);
    font-size: var(--fs-caption);
    font-weight: 600;
    color: var(--text-muted);
    white-space: nowrap;
    transition:
      background var(--dur-fast),
      color var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  .ends:hover:not(:disabled) {
    color: var(--text);
    background: var(--glass-hover);
  }

  .ends:disabled {
    cursor: default;
  }

  .ends[aria-pressed="true"] {
    color: var(--accent);
  }

  .row {
    /* Popovers in this row open above the whole bar, clear of the seek row. */
    --lift: calc(var(--seek-h) + 2px + var(--sp-2));
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: var(--sp-4);
  }

  .now {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-width: 0;
    padding: var(--sp-1);
    margin-left: calc(-1 * var(--sp-1));
    border-radius: var(--r-lg);
  }

  .thumb {
    flex: none;
    width: 48px;
    height: 48px;
    border-radius: var(--r-art-sm);
    object-fit: cover;
    box-shadow: 0 6px 18px -8px rgb(0 0 0 / 0.8);
  }

  .blank {
    display: grid;
    place-items: center;
    background: var(--glass);
    color: var(--text-muted);
  }

  .meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .line {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-width: 0;
  }

  .title,
  .sub {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .title {
    font-size: var(--fs-lead);
    font-weight: 650;
  }

  .sub {
    font-size: var(--fs-small);
    color: var(--text-muted);
  }

  .dash {
    margin: 0 0.4em;
  }

  .badge {
    flex: none;
    padding: 1px 7px;
    border-radius: var(--r-pill);
    font-size: var(--fs-micro);
    font-weight: 650;
    color: var(--text-muted);
    box-shadow: inset 0 0 0 1px var(--glass-edge-top);
    white-space: nowrap;
  }

  .transport {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .tools {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 2px;
    min-width: 0;
  }

  /* Popover panels size to their content; four 84 px layout tiles. */
  .layouts {
    width: 360px;
  }

  .rule {
    width: 1px;
    height: 20px;
    margin: 0 var(--sp-2);
    background: var(--glass-edge-top);
  }

  /* Shared by the bar's own buttons and the ones its popovers and volume put in it. */
  .bar :global(.ctl) {
    position: relative;
    flex: none;
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    color: var(--text-muted);
    transition:
      color var(--dur-fast),
      background var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  .bar :global(.ctl:hover),
  .bar :global(.ctl.open) {
    color: var(--text);
    background: var(--glass-hover);
  }

  .bar :global(.ctl.on) {
    color: var(--accent);
  }

  .bar :global(.chip) {
    height: 40px;
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin-right: var(--sp-2);
    padding: 0 var(--sp-3) 0 var(--sp-3);
    border-radius: var(--r-pill);
    background: var(--glass);
    box-shadow: inset 0 0 0 1px var(--glass-edge);
    color: var(--text);
    transition:
      background var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  .bar :global(.chip:hover),
  .bar :global(.chip.open) {
    background: var(--glass-active);
  }

  .play {
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    background: var(--paper);
    color: var(--ink);
    box-shadow: 0 8px 22px -10px rgb(0 0 0 / 0.9);
    transition:
      background var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  .play:hover {
    background: var(--accent);
  }

  .one {
    position: absolute;
    top: 6px;
    right: 6px;
    font-size: 9px;
    font-weight: 800;
  }

  /* Narrow windows (cinema fills the window, so its width sets the bar's): the chip keeps its
     icon, the song text goes. */
  @media (max-width: 1240px) {
    .bar :global(.chip .chip-text) {
      display: none;
    }

    .badge {
      display: none;
    }
  }

  @media (max-width: 1040px) {
    .ends {
      display: none;
    }
  }
</style>
