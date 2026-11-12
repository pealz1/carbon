<script lang="ts">
  import { onNavigate } from "$app/navigation";
  import { fade } from "svelte/transition";
  import { joinNames } from "$lib/format";
  import { IdleTimer } from "$lib/idle";
  import { offsetFor } from "$lib/lyric-offsets";
  import { lyricsFor, type Lyrics as LyricsResult } from "$lib/lyrics";
  import { menu } from "$lib/menu.svelte";
  import { player } from "$lib/player.svelte";
  import { prefs } from "$lib/preferences.svelte";
  import { view } from "$lib/view.svelte";
  import { LYRICS_LEAD_MS } from "$lib/words";
  import Ambient from "./Ambient.svelte";
  import CinemaBar from "./CinemaBar.svelte";
  import Lyrics from "./Lyrics.svelte";
  import Toasts from "./Toasts.svelte";
  import YoutubeSlot from "./YoutubeSlot.svelte";

  // Immersive now playing: colour from the artwork (never the artwork blurred), four layouts and a
  // floating bar that steps aside when idle. Every layout keeps the cover (or YouTube's video) and
  // the song's name on screen, nothing is drawn over the art, and the bar's space is kept clear.
  const IDLE_MS = 3_000;
  let idle = $state(false);
  let root = $state<HTMLElement>();
  let barHeight = $state(0);
  let lyrics = $state<LyricsResult | null>(null);
  let offset = $state(0);
  const timer = new IdleTimer(IDLE_MS, (on) => (idle = on));
  const hold = (reason: string, on: boolean) => timer.hold(reason, on);

  $effect(() => {
    root?.focus();
    timer.wake();
    return () => timer.stop();
  });
  $effect(() => hold("menu", menu.current !== null));
  // A link in the bar or a menu's "Go to album" leaves cinema for that page.
  onNavigate(() => void view.exitCinema());

  // The bar's scrubber reads the same lyrics as the lyrics view (one shared lookup per song).
  $effect(() => {
    const track = player.track;
    lyrics = null;
    if (!track) return;
    offset = offsetFor(track.id);
    let live = true;
    lyricsFor(track).then(
      (found) => live && (lyrics = found),
      (e) => console.warn("[cinema] lyrics", e),
    );
    return () => (live = false);
  });

  const chosen = $derived(prefs.value?.cinemaLayout ?? "split");
  // Songs without words show the cover instead of an empty lyrics column.
  const wordless = $derived(lyrics?.kind === "none" || lyrics?.kind === "instrumental");
  const layout = $derived(wordless && (chosen === "split" || chosen === "lyrics") ? "cover" : chosen);
  const lines = $derived(lyrics?.kind === "synced" ? lyrics.lines : []);
  const youtube = $derived(player.source === "youtube");
</script>

<div
  bind:this={root}
  class="cinema"
  class:idle
  role="dialog"
  aria-modal="true"
  aria-label="Cinema mode"
  tabindex="-1"
  style="--bar-h: {barHeight}px"
  onpointermove={() => timer.wake()}
  onpointerdown={() => timer.wake()}
  onkeydown={() => timer.wake()}
  transition:fade={{ duration: 260 }}
>
  <Ambient image={player.artwork} playing={!player.paused} />
  <!-- First in the DOM so Tab reaches the controls before the lyric lines; it still sits at the bottom. -->
  <CinemaBar hidden={idle} {lines} shiftMs={LYRICS_LEAD_MS + offset} bind:offset bind:height={barHeight} onhold={hold} />
  <div class="notices"><Toasts /></div>

  {#if player.track}
    {@const track = player.track}
    <div class="stage is-{layout}" class:youtube>
      {#if layout === "split" || layout === "cover"}
        <figure class="hero">
          {#if youtube}<YoutubeSlot />{:else if player.artwork}<img src={player.artwork} alt="" width="640" height="640" />{/if}
          <figcaption class="words">
            <span class="name">{track.name}</span>
            <span class="by">{joinNames(track.artists)}</span>
          </figcaption>
        </figure>
      {:else}
        <header class="caption">
          {#if youtube}<div class="video"><YoutubeSlot /></div>{:else if player.artwork}<img src={player.artwork} alt="" width="72" height="72" />{/if}
          <div class="words">
            <span class="name">{track.name}</span>
            <span class="by">{joinNames(track.artists)}{track.album?.name ? ` — ${track.album.name}` : ""}</span>
          </div>
        </header>
      {/if}
      {#if layout === "split" || layout === "lyrics"}<Lyrics variant="cinema" bind:offset />{/if}
    </div>
  {:else}
    <p class="empty">Play something to fill the screen.</p>
  {/if}

</div>

<style>
  .cinema {
    /* Kept clear for the bar whether or not it's showing, so nothing moves when it hides. */
    --reserve: calc(var(--bar-h) + var(--sp-4) + var(--sp-5));
    --hero-max: calc(100vh - var(--sp-7) - var(--reserve) - 76px);
    position: fixed;
    inset: 0;
    z-index: 40;
    overflow: hidden;
    background: var(--black);
    color: var(--chrome-text);
    outline: none;
  }

  .cinema.idle {
    cursor: none;
  }

  .stage {
    position: relative;
    height: 100%;
    padding: var(--sp-7) var(--sp-7) var(--reserve);
  }

  .stage :global(.lyrics) {
    height: 100%;
  }

  .hero {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    min-width: 0;
    margin: 0;
  }

  .hero img {
    width: min(100%, 560px, var(--hero-max));
    height: auto;
    aspect-ratio: 1;
    border-radius: var(--r-art);
    object-fit: cover;
    box-shadow: var(--shadow-art);
  }

  .words {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .name,
  .by {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .name {
    font-family: var(--font-display);
    font-size: var(--fs-section);
    font-weight: 700;
    letter-spacing: var(--tracking-tight);
  }

  .by {
    font-size: var(--fs-lead);
    color: var(--chrome-text-muted);
  }

  /* Cover and lyrics side by side. */
  .is-split {
    display: grid;
    grid-template-columns: minmax(260px, 0.8fr) minmax(0, 1.6fr);
    gap: var(--sp-7);
    align-items: center;
  }

  /* The cover alone, as large as the screen allows. */
  .is-cover {
    display: grid;
    place-items: center;
  }

  .is-cover .hero {
    align-items: center;
    max-width: 100%;
    text-align: center;
  }

  .is-cover .hero img {
    width: min(720px, var(--hero-max));
  }

  .is-cover.youtube .hero {
    width: min(960px, 100%);
  }

  .is-cover .name {
    font-size: var(--fs-hero);
  }

  /* Lyrics alone, centred under a small caption. */
  .is-lyrics {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    justify-items: center;
    gap: var(--sp-5);
    padding-top: var(--sp-6);
  }

  .is-lyrics :global(.lyrics) {
    width: min(1100px, 100%);
  }

  .is-lyrics :global(.lyrics li button) {
    text-align: center;
    transform-origin: center;
  }

  .caption {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    min-width: 0;
    max-width: 100%;
  }

  .caption img {
    flex: none;
    width: 72px;
    height: 72px;
    border-radius: var(--r-art-sm);
    object-fit: cover;
    box-shadow: var(--shadow-art);
  }

  /* YouTube's player can't shrink below 200 px high, so captions with video give it room. */
  .caption .video {
    flex: none;
    width: 356px;
  }

  /* Just the wallpaper, and the song in a corner. */
  .is-ambient {
    display: flex;
    align-items: flex-end;
  }

  .is-ambient .name {
    font-size: var(--fs-hero);
  }

  .empty {
    position: relative;
    display: grid;
    place-items: center;
    height: 100%;
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--fs-title);
    color: var(--chrome-text-muted);
  }

  .notices {
    position: absolute;
    left: 0;
    right: 0;
    bottom: calc(var(--reserve) - var(--sp-4));
    z-index: 3;
    container-type: inline-size;
  }
</style>
