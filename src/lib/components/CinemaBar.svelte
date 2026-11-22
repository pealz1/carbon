<script lang="ts">
  import { artTones } from "$lib/art-tones.svelte";
  import { clockTime, endsAt, queueEndsAt } from "$lib/cinema";
  import { formatDuration } from "$lib/format";
  import { hold } from "$lib/hold";
  import { hasPage, isLocalUri } from "$lib/local/tracks";
  import { onScreen } from "$lib/on-screen.svelte";
  import type { LyricLine } from "$lib/lrc";
  import { menu } from "$lib/menu.svelte";
  import { addToPlaylistItems, trackMenu } from "$lib/menus";
  import type { CinemaLayout } from "$lib/native";
  import { player } from "$lib/player.svelte";
  import { popouts } from "$lib/popout/host.svelte";
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
  import LiquidFilter from "./LiquidFilter.svelte";
  import LikeButton from "./LikeButton.svelte";
  import LyricScrubber from "./LyricScrubber.svelte";
  import LyricsControls from "./LyricsControls.svelte";
  import PlaybackTools from "./PlaybackTools.svelte";
  import UpNext from "./UpNext.svelte";
  import VolumeControl from "./VolumeControl.svelte";

  // Cinema's floating bar: the song, progress that knows the lyrics, transport, and the room's
  // controls, the less used of them folded behind "More". It steps aside when idle; `onhold` keeps
  // it up while it's in use.
  let {
    hidden,
    lines,
    shiftMs,
    offset = $bindable(0),
    height = $bindable(0),
    onhold,
  }: {
    hidden: boolean;
    lines: LyricLine[];
    shiftMs: number;
    offset?: number;
    height?: number;
    onhold: (reason: string, on: boolean) => void;
  } = $props();

  const TICK_MS = 250;
  // "More" only reveals buttons in the bar, so it alone doesn't hold the bar up the way a popover does.
  const OPEN_POPOVER = "[aria-expanded='true']:not(.more)";
  /** The time after the scrubber: what's left of the song, then when it ends, then when the queue does. */
  const CLOCKS = ["left", "song", "queue"] as const;
  let bar = $state<HTMLElement>();
  let width = $state(0);
  let position = $state(player.position());
  let now = $state(Date.now());
  let clock = $state<(typeof CLOCKS)[number]>("left");
  let extras = $state(false);

  // Fold the extras away whenever the bar steps aside, so it comes back tidy.
  $effect(() => {
    if (hidden) extras = false;
  });

  $effect(() => {
    if (!onScreen.current) return;
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
  const showQueueEnd = $derived(clock === "queue" && exactQueue);
  const showLeft = $derived(clock === "left" || (clock === "queue" && !exactQueue) || player.durationMs <= 0);
  const ends = $derived(showQueueEnd ? queueEndsAt(now, position, player.durationMs, upNext) : endsAt(now, position, player.durationMs));
  const remaining = $derived(Math.max(0, player.durationMs - position));

  function nextClock() {
    const next = CLOCKS[(CLOCKS.indexOf(clock) + 1) % CLOCKS.length];
    clock = next === "queue" && !exactQueue ? "left" : next;
  }

  const tones = artTones(() => player.artwork);
  const tint = $derived(tones.current ? `--tint-a: ${css(tones.current.wash, 0.4)}; --tint-b: ${css(tones.current.wash2, 0.26)}` : "");

  function addToPlaylist(event: MouseEvent) {
    const track = player.track;
    if (track) menu.open(event, isYoutubeUri(track.uri) ? youtubePlaylistItems([track.id]) : addToPlaylistItems([track.uri]));
  }

  /** The mini player replaces cinema (YouTube Music's turns this window compact, so cinema must go first). */
  async function toMiniPlayer() {
    await view.exitCinema();
    if (!popouts.miniShown) await popouts.toggleMini();
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
  bind:offsetWidth={width}
  class="bar"
  class:hidden
  style={tint}
  aria-label="Player"
  onpointerenter={() => onhold("hover", true)}
  onpointerleave={() => onhold("hover", false)}
  onfocusin={focusIn}
  onfocusout={focusOut}
>
  <LiquidFilter id="cinema-glass" {width} {height} />
  <div class="seek">
    <span class="time tabular">{formatDuration(position)}</span>
    <LyricScrubber {position} durationMs={player.durationMs} {lines} {shiftMs} onseek={player.seek} />
    <button
      class="time clock tabular"
      onclick={nextClock}
      disabled={!player.track || player.durationMs <= 0}
      title={clock === "left" ? "Show when this song ends" : clock === "song" && exactQueue ? "Show when the queue ends" : undefined}
    >
      {#if showLeft}−{formatDuration(remaining)}{:else}{showQueueEnd ? "Queue ends" : "Ends"} {clockTime(ends)}{/if}
    </button>
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
          {#if hasPage(album)}<a class="title" href={pageHref("album", album!)}>{track.name}</a>{:else}<span class="title">{track.name}</span>{/if}
          <span class="sub">
            {#each track.artists as artist, i (artist.uri + i)}
              {#if i > 0}{", "}{/if}{#if hasPage(artist)}<a href={pageHref("artist", artist)}>{artist.name}</a>{:else}{artist.name}{/if}
            {/each}
          </span>
        </div>
        <LikeButton uri={track.uri} label={track.name} size={18} />
      {:else}
        <span class="sub">Nothing playing</span>
      {/if}
    </div>

    <div class="transport">
      <button class="ctl" class:on={player.shuffle} onclick={player.toggleShuffle} aria-label="Shuffle" aria-pressed={player.shuffle} title="Shuffle">
        <Icon name="shuffle" size={18} />
      </button>
      <button class="ctl" onclick={player.previous} aria-label="Previous" title="Previous"><Icon name="prev" size={20} /></button>
      <button class="play" class:playing={!player.paused} onclick={player.togglePlay} aria-label={player.paused ? "Play" : "Pause"} title={player.paused ? "Play" : "Pause"}>
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
      <VolumeControl />
      <!-- Kept mounted while folded; anything on in here (sleep timer, session, device, speed) dots "More". -->
      <div id="cinema-extras" class="extras" class:open={extras} inert={!extras}>
        {#if player.track && !isLocalUri(player.track.uri) && player.source !== "radio"}
          <button class="ctl" onclick={addToPlaylist} aria-label="Add {player.track.name} to a playlist" title="Add to playlist"><Icon name="listAdd" size={18} /></button>
        {/if}
        <BarPopover label="Layout">
          {#snippet button()}<Icon name="layouts" size={18} />{/snippet}
          <div class="layouts"><CinemaLayouts value={prefs.value?.cinemaLayout ?? "split"} onpick={(cinemaLayout: CinemaLayout) => prefs.update({ cinemaLayout })} /></div>
        </BarPopover>
        <PlaybackTools />
        <button class="ctl" onclick={toMiniPlayer} aria-label="Mini player" title="Mini player"><Icon name="pip" size={18} /></button>
      </div>
      <button class="ctl more" class:open={extras} onclick={() => (extras = !extras)} aria-expanded={extras} aria-controls="cinema-extras" aria-label="More" title="More">
        <Icon name="more" size={18} />
      </button>
      <span class="rule" aria-hidden="true"></span>
      <button class="ctl full" onclick={view.toggleFullscreen} aria-label={view.fullscreen ? "Leave full screen" : "Full screen"} title="Full screen (F11)">
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
    width: min(1280px, calc(100% - 2 * var(--sp-5)));
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
    background: var(--glass-sheen), var(--grain), linear-gradient(100deg, var(--tint-a), var(--tint-b)), var(--glass-strong);
    backdrop-filter: var(--glass-blur);
    box-shadow: var(--glass-rim), 0 28px 64px -18px rgb(0 0 0 / 0.8);
    pointer-events: none;
  }

  /* Liquid glass where the engine can bend a backdrop (WebView2): clearer and less frosted, with
     the light behind bending at the rim. Full effects only. */
  :global([data-engine="chromium"][data-effects="full"]) .bar::before {
    background: var(--glass-sheen), linear-gradient(100deg, var(--tint-a), var(--tint-b)), rgb(10 10 12 / 0.46);
    backdrop-filter: url(#cinema-glass) blur(5px) saturate(1.7) brightness(0.82);
  }

  /* The artwork's colour pooling under the bar, as if the glass were lit from the song. */
  .bar::after {
    content: "";
    position: absolute;
    inset: 40% 12% -28px;
    z-index: -2;
    border-radius: 50%;
    background: radial-gradient(closest-side, var(--tint-a), transparent);
    opacity: 0.9;
    pointer-events: none;
  }

  .bar.hidden {
    opacity: 0;
    transform: translateY(24px) scale(0.98);
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
    font-size: var(--fs-micro);
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--text-muted);
    opacity: 0.75;
  }

  .time:first-child {
    text-align: right;
  }

  /* Time left; a click turns it into when the song, then the queue, ends. */
  .clock {
    height: 22px;
    padding: 0 6px;
    border-radius: var(--r-pill);
    text-align: left;
    white-space: nowrap;
    transition:
      color var(--dur-fast),
      opacity var(--dur-fast),
      background var(--dur-fast);
  }

  .clock:hover:not(:disabled) {
    color: var(--text);
    opacity: 1;
    background: var(--glass-hover);
  }

  .clock:disabled {
    cursor: default;
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
    box-shadow:
      0 0 0 1px rgb(255 255 255 / 0.08),
      0 8px 22px -8px rgb(0 0 0 / 0.85);
    transition: transform var(--dur-spring) var(--ease-spring);
  }

  .now:hover .thumb {
    transform: scale(calc(2 - var(--press)));
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
    gap: 1px;
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
    letter-spacing: -0.01em;
  }

  .sub {
    font-size: var(--fs-small);
    color: var(--text-muted);
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

  /* Folded away until "More" opens them; they then slide out of it one after another. */
  .extras {
    display: none;
    align-items: center;
    gap: 2px;
  }

  .extras.open {
    display: flex;
  }

  .extras.open > :global(*) {
    animation: unfold var(--dur-spring) var(--ease-spring) backwards;
  }

  .extras.open > :global(*:nth-last-child(2)) {
    animation-delay: 30ms;
  }

  .extras.open > :global(*:nth-last-child(3)) {
    animation-delay: 60ms;
  }

  .extras.open > :global(*:nth-last-child(n + 4)) {
    animation-delay: 90ms;
  }

  @keyframes unfold {
    from {
      opacity: 0;
      transform: translateX(14px) scale(0.85);
    }
  }

  .more :global(svg) {
    transition:
      transform var(--dur-spring) var(--ease-spring),
      scale var(--dur-spring) var(--ease-spring);
  }

  .more.open :global(svg) {
    transform: rotate(90deg);
  }

  /* Popover panels size to their content; four 84 px layout tiles. */
  .layouts {
    width: 360px;
  }

  .rule {
    width: 1px;
    height: 18px;
    margin: 0 var(--sp-2);
    background: linear-gradient(transparent, var(--glass-edge-top), transparent);
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
      transform var(--dur-spring) var(--ease-spring);
  }

  .bar :global(.ctl:hover),
  .bar :global(.ctl.open) {
    color: var(--text);
    background: var(--glass-hover);
  }

  /* On (shuffle, repeat, a running sleep timer): bright, with a small dot beneath, not a colour. */
  .bar :global(.ctl.on) {
    color: var(--text);
  }

  .bar :global(.ctl.on)::after,
  .tools:has(.extras:not(.open) :global(.ctl.on)) .more::after {
    content: "";
    position: absolute;
    bottom: 3px;
    left: 50%;
    width: 4px;
    height: 4px;
    margin-left: -2px;
    border-radius: var(--r-pill);
    background: currentColor;
    box-shadow: 0 0 6px currentColor;
  }

  /* Up next is the queue icon alone here; its popover names the songs. */
  .bar :global(.chip) {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    padding: 0;
    border-radius: var(--r-pill);
    color: var(--text-muted);
    transition:
      color var(--dur-fast),
      background var(--dur-fast),
      transform var(--dur-spring) var(--ease-spring);
  }

  .bar :global(.chip .chip-text) {
    display: none;
  }

  .bar :global(.chip:hover),
  .bar :global(.chip.open) {
    color: var(--text);
    background: var(--glass-hover);
  }

  .play {
    position: relative;
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    background: var(--paper);
    color: var(--ink);
    box-shadow: 0 8px 22px -10px rgb(0 0 0 / 0.9);
    transition:
      box-shadow var(--dur-med),
      transform var(--dur-spring) var(--ease-spring);
  }

  /* A soft light around the button while music plays. */
  .play::before {
    content: "";
    position: absolute;
    inset: -10px;
    z-index: -1;
    border-radius: inherit;
    background: radial-gradient(closest-side, rgb(255 255 255 / 0.28), transparent);
    opacity: 0;
    transition: opacity var(--dur-slow) var(--ease-out);
    pointer-events: none;
  }

  .play.playing::before {
    opacity: 1;
  }

  /* Grows as much as a press shrinks (none with motion off); the app's press feedback takes over on click. */
  .play:hover:not(:active) {
    transform: scale(calc(2 - var(--press)));
    box-shadow:
      0 0 0 4px rgb(255 255 255 / 0.12),
      0 10px 26px -10px rgb(0 0 0 / 0.9);
  }

  .one {
    position: absolute;
    top: 6px;
    right: 6px;
    font-size: 9px;
    font-weight: 800;
  }

  /* Narrower windows (cinema fills the window, so its width sets the bar's) give up full screen
     (F11 still works) and the centring of the transport, so the song's name gives up room instead. */
  @media (max-width: 1240px) {
    .bar {
      padding-inline: var(--sp-4);
    }

    .row {
      grid-template-columns: minmax(0, 1fr) auto auto;
    }

    .rule,
    .full {
      display: none;
    }
  }
</style>
