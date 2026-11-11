<script lang="ts" module>
  import type { IconName } from "./Icon.svelte";

  export interface Chip {
    label: string;
    icon?: IconName;
  }
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import { artTones } from "$lib/art-tones.svelte";
  import { menu, type MenuEntry } from "$lib/menu.svelte";
  import { player } from "$lib/player.svelte";
  import { css } from "$lib/wallpaper";
  import Icon from "./Icon.svelte";

  // Album, playlist, artist and collection headers. The artwork is shown whole and untouched;
  // colour read from it washes the space behind the header and tints the Play pill.
  let {
    title,
    image,
    chips = [],
    byline,
    description,
    playUri,
    onplay,
    onshuffle,
    round = false,
    shuffleCount,
    menuItems,
    placeholder = "note",
    children,
  }: {
    title: string;
    image: string | null;
    /** Small facts (kind, year, song count, length) shown as chips under the title. */
    chips?: Chip[];
    /** Who made it: artist links or the playlist owner. */
    byline?: Snippet;
    description?: string | null;
    playUri?: string;
    /** Play and shuffle for things Carbon queues itself (local albums, Carbon playlists) instead of a Spotify context. */
    onplay?: () => void;
    onshuffle?: () => void;
    /** Round artwork, for artists. */
    round?: boolean;
    /** Number of songs, so a shuffle can start on a random one. */
    shuffleCount?: number;
    /** Items for the "…" menu. */
    menuItems?: () => MenuEntry[];
    /** Icon shown when there's no artwork. */
    placeholder?: IconName;
    /** Extra actions after Play. */
    children?: Snippet;
  } = $props();

  const tones = artTones(() => image);
  const live = $derived(!!playUri && player.contextUri === playUri);
  const playing = $derived(live && !player.paused);
  const style = $derived(
    tones.current ? `--wash: ${css(tones.current.wash)}; --wash2: ${css(tones.current.wash2)}; --pill: ${css(tones.current.pill)}` : "",
  );

  function play() {
    if (onplay) return onplay();
    if (!playUri) return;
    if (live) player.togglePlay();
    else player.playContext(playUri);
  }

  const canPlay = $derived(!!playUri || !!onplay);
  const shuffle = () => (onshuffle ? onshuffle() : playUri && player.shufflePlay(playUri, shuffleCount));
</script>

<header class="detail" class:washed={!!tones.current} {style}>
  <div class="art" class:round>
    {#if image}
      <img src={image} alt="" width="350" height="350" />
    {:else}
      <div class="placeholder" class:liked={placeholder === "heart"}><Icon name={placeholder} size={72} filled={placeholder === "heart"} /></div>
    {/if}
  </div>
  <div class="info">
    <h1 class:long={title.length > 30}>{title}</h1>
    {#if byline}<div class="byline">{@render byline()}</div>{/if}
    {#if chips.length}
      <ul class="chips" aria-label="Details">
        {#each chips as chip (chip.label)}
          <li>{#if chip.icon}<Icon name={chip.icon} size={12} />{/if}{chip.label}</li>
        {/each}
      </ul>
    {/if}
    {#if description}<p class="description">{description}</p>{/if}
    <div class="actions">
      {#if canPlay}
        {#if playUri || onshuffle}
          <button class="circle" onclick={shuffle} aria-label="Shuffle play" title="Shuffle play">
            <Icon name="shuffle" size={19} />
          </button>
        {/if}
        <button class="play" onclick={play} aria-label={playing ? "Pause" : "Play"}>
          <Icon name={playing ? "pause" : "play"} size={18} />
          <span>{playing ? "Pause" : "Play"}</span>
        </button>
      {/if}
      {@render children?.()}
      {#if menuItems}
        <button class="circle" onclick={(e) => menu.open(e, menuItems())} aria-label="More options for {title}" aria-haspopup="menu" title="More">
          <Icon name="more" size={19} />
        </button>
      {/if}
    </div>
  </div>
</header>

<style>
  .detail {
    --art-size: 350px;
    --wash: var(--graphite-800);
    --wash2: var(--graphite-900);
    --pill: var(--paper);
    position: relative;
    isolation: isolate;
    display: flex;
    align-items: flex-end;
    gap: var(--sp-5);
    margin: 0 calc(var(--page-x, 0px) * -1) var(--sp-5);
    padding: var(--sp-5) var(--page-x, 0px) var(--sp-4);
  }

  /* The wash: two colours from the artwork meeting behind the header, gone by ~520 px down. */
  .detail::before {
    content: "";
    position: absolute;
    /* Reaches up past any notice above the header; the stage clips what's above its top. */
    inset: -240px 0 -160px;
    z-index: -1;
    background:
      radial-gradient(70% 80% at 18% 24%, var(--wash) 0%, transparent 72%),
      radial-gradient(60% 80% at 88% 24%, var(--wash2) 0%, transparent 70%);
    mask-image: linear-gradient(to bottom, black 55%, transparent);
    opacity: 0;
    transition: opacity var(--dur-slow) var(--ease-out);
    pointer-events: none;
  }

  .washed::before {
    opacity: 1;
  }

  .art {
    flex: none;
    width: var(--art-size);
  }

  .art img,
  .placeholder {
    width: var(--art-size);
    height: var(--art-size);
    border-radius: var(--r-art);
    object-fit: cover;
    box-shadow: var(--shadow-art);
  }

  .round img,
  .round .placeholder {
    border-radius: var(--r-pill);
  }

  .placeholder {
    display: grid;
    place-items: center;
    background: var(--graphite-800);
    color: var(--text-faint);
  }

  /* Liked Songs is Carbon's own tile: a graphite plate carrying the yellow heart. */
  .placeholder.liked {
    background: radial-gradient(80% 80% at 50% 40%, var(--graphite-700), var(--graphite-900));
    box-shadow: var(--shadow-art), inset 0 1px 0 rgb(255 255 255 / 0.08);
    color: var(--accent);
  }

  .info {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-3);
    min-width: 0;
    padding-bottom: 2px;
  }

  h1 {
    font-size: var(--fs-title);
    font-weight: 800;
    line-height: 1.04;
    overflow-wrap: anywhere;
  }

  h1.long {
    font-size: 2rem;
  }

  .byline {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    font-size: var(--fs-lead);
    font-weight: 600;
  }

  /* A person in the byline: a 28 px avatar (or a quiet stand-in) and their name. */
  .byline :global(.person) {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    padding: 2px var(--sp-3) 2px 2px;
    border-radius: var(--r-pill);
    transition: background var(--dur-fast);
  }

  .byline :global(.person:is(a, button):hover) {
    background: rgb(255 255 255 / 0.08);
    text-decoration: none;
  }

  .byline :global(.avatar) {
    width: 28px;
    height: 28px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    background: rgb(255 255 255 / 0.1);
    color: var(--text-muted);
    object-fit: cover;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .chips li {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 24px;
    padding: 0 9px;
    border-radius: var(--r-pill);
    background: rgb(255 255 255 / 0.08);
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.1);
    color: rgb(255 255 255 / 0.78);
    font-size: var(--fs-micro);
    font-weight: 600;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
  }

  .description {
    display: -webkit-box;
    max-width: 62ch;
    margin: 0;
    overflow: hidden;
    color: rgb(255 255 255 / 0.68);
    font-size: var(--fs-body);
    line-height: 1.5;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    user-select: text;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
    margin-top: var(--sp-2);
  }

  .circle {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    background: rgb(255 255 255 / 0.08);
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.1), inset 0 0 0 1px rgb(255 255 255 / 0.08);
    color: var(--text);
    transition:
      background var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
  }

  .circle:hover {
    background: rgb(255 255 255 / 0.15);
  }

  .play {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    min-width: 140px;
    height: 44px;
    padding: 0 var(--sp-5) 0 var(--sp-4);
    border-radius: var(--r-pill);
    background: var(--pill);
    color: var(--ink);
    font-size: var(--fs-lead);
    font-weight: 700;
    box-shadow: 0 10px 30px -12px rgb(0 0 0 / 0.8);
    transition: transform var(--dur-med) var(--ease-spring);
  }

  .play::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: rgb(255 255 255 / 0.22);
    opacity: 0;
    transition: opacity var(--dur-fast);
  }

  .play:hover::after {
    opacity: 1;
  }

  /* Narrow stage (small window, lyrics docked): smaller art, then art above the text. */
  @container stage (max-width: 1100px) {
    .detail {
      --art-size: 248px;
    }

    h1 {
      font-size: 2rem;
    }
  }

  @container stage (max-width: 760px) {
    .detail {
      flex-direction: column;
      align-items: flex-start;
    }

    .detail {
      --art-size: 200px;
    }
  }
</style>
