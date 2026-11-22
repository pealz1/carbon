<script lang="ts" module>
  import type { IconName } from "./Icon.svelte";

  export interface Chip {
    label: string;
    icon?: IconName;
  }

  /** A line in the About panel: "Released" → "30 April 2020". */
  export interface Fact {
    label: string;
    value: string;
  }
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import { artTones } from "$lib/art-tones.svelte";
  import { feelFor } from "$lib/audio-features";
  import { pace } from "$lib/song-pulse";
  import { t } from "$lib/i18n/locale.svelte";
  import { menu, type MenuEntry } from "$lib/menu.svelte";
  import { shareItem } from "$lib/menus";
  import { player } from "$lib/player.svelte";
  import { css } from "$lib/wallpaper";
  import ArtworkViewer from "./ArtworkViewer.svelte";
  import Icon from "./Icon.svelte";
  import Modal from "./Modal.svelte";
  import SpotifyPlaylistCover from "./SpotifyPlaylistCover.svelte";
  import DevicePicker from "./DevicePicker.svelte";

  // Album, playlist, artist and collection headers. The artwork is shown whole and untouched (it
  // floats, tilts toward the pointer as one piece and opens full size on click); colour read from it
  // drifts behind the header as a grainy wash, paced by how the songs feel, and tints the Play pill.
  let {
    title,
    image,
    playlistCover,
    chips = [],
    byline,
    description,
    playUri,
    onplay,
    onshuffle,
    round = false,
    shuffleCount,
    menuItems,
    placeholderIcon = "note",
    share,
    facts = [],
    feelIds = [],
    children,
  }: {
    title: string;
    image: string | null;
    playlistCover?: { id: string; public: boolean | null };
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
    placeholderIcon?: IconName;
    /** A Share button beside Play: the link, the name, or the page on Spotify. */
    share?: { uri: string; name: string };
    /** Release date, label and the like, shown with the description in the About panel. */
    facts?: Fact[];
    /** Spotify ids of the list's first songs: their tempo and energy pace the wash. */
    feelIds?: readonly string[];
    /** Extra actions after Play. */
    children?: Snippet;
  } = $props();

  const tones = artTones(() => image);
  const live = $derived(!!playUri && player.contextUri === playUri);
  const playing = $derived(live && !player.paused);
  // A calm list drifts slowly, a fast loud one moves; unknown songs get a neutral pace.
  let drift = $state(1);
  $effect(() => {
    const ids = feelIds;
    drift = 1;
    if (!ids.length) return;
    let current = true;
    void feelFor(ids).then((feel) => current && feel && (drift = pace({ tempo: feel.tempo, energy: feel.energy, volume: 1, playing: true })));
    return () => (current = false);
  });
  const style = $derived(
    (tones.current ? `--wash: ${css(tones.current.wash)}; --wash2: ${css(tones.current.wash2)}; --pill: ${css(tones.current.pill)}; ` : "") + `--pace: ${drift.toFixed(2)}`,
  );

  function play() {
    if (onplay) return onplay();
    if (!playUri) return;
    if (live) player.togglePlay();
    else player.playContext(playUri);
  }

  const canPlay = $derived(!!playUri || !!onplay);
  const hasAbout = $derived(!!description || facts.length > 0);
  let viewing = $state(false);
  let reading = $state(false);
  // -0.5 to 0.5 across the cover; drives the tilt and the shadow that moves against it.
  let lean = $state({ x: 0, y: 0 });
  function follow(event: PointerEvent) {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    lean = { x: (event.clientX - box.left) / box.width - 0.5, y: (event.clientY - box.top) / box.height - 0.5 };
  }
  const shuffle = () => (onshuffle ? onshuffle() : playUri && player.shufflePlay(playUri, shuffleCount));
</script>

<header class="detail" class:washed={!!tones.current} {style}>
  <div class="wash" aria-hidden="true"><i class="blob a"></i><i class="blob b"></i><i class="blob c"></i><i class="grain"></i></div>
  <div class="art" class:round class:playing>
    {#if image}
      <button
        class="cover"
        style="--lx: {lean.x}; --ly: {lean.y}"
        onpointermove={follow}
        onpointerleave={() => (lean = { x: 0, y: 0 })}
        onclick={() => (viewing = true)}
        aria-label="View artwork for {title}"
        title="View artwork"
      >
        {#if playlistCover}
          <div class="placeholder"><SpotifyPlaylistCover id={playlistCover.id} {image} allowPublic={playlistCover.public !== false} size={72} /></div>
        {:else}
          <img src={image} alt="" width="350" height="350" />
        {/if}
      </button>
    {:else if playlistCover}
      <div class="placeholder"><SpotifyPlaylistCover id={playlistCover.id} {image} allowPublic={playlistCover.public !== false} size={72} /></div>
    {:else}
      <div class="placeholder" class:liked={placeholderIcon === "heart"}><Icon name={placeholderIcon} size={72} filled={placeholderIcon === "heart"} /></div>
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
    {#if description}
      <button class="description" onclick={() => (reading = true)} title="Read more">{description}</button>
    {/if}
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
      {#if share}
        <button class="circle" onclick={(e) => menu.open(e, shareItem(share.uri, share.name).items ?? [])} aria-label="Share" aria-haspopup="menu" title="Share">
          <Icon name="export" size={18} />
        </button>
      {/if}
      {#if hasAbout}
        <button class="circle" onclick={() => (reading = true)} aria-label="About {title}" aria-haspopup="dialog" title="About">
          <Icon name="info" size={19} />
        </button>
      {/if}
      {@render children?.()}
      {#if playUri && /^spotify:(playlist|album|artist):/.test(playUri)}
        <DevicePicker contextUri={playUri} />
      {/if}
      {#if menuItems}
        <button class="circle" onclick={(e) => menu.open(e, menuItems())} aria-label="More options for {title}" aria-haspopup="menu" title="More">
          <Icon name="more" size={19} />
        </button>
      {/if}
    </div>
  </div>
</header>

{#if viewing && image}
  <ArtworkViewer src={image} {title} onclose={() => (viewing = false)} />
{/if}

{#if reading}
  <Modal title="About" wide onclose={() => (reading = false)}>
    <div class="about">
      <div class="notes">
        {#if description}<p>{description}</p>{:else}<p class="quiet">No notes for this one.</p>{/if}
      </div>
      <aside>
        {#if image}<img src={image} alt="" width="160" height="160" />{/if}
        <strong>{title}</strong>
        {#if facts.length}
          <dl>
            {#each facts as fact (fact.label)}
              <dt>{t(fact.label)}</dt>
              <dd>{t(fact.value)}</dd>
            {/each}
          </dl>
        {/if}
      </aside>
    </div>
  </Modal>
{/if}

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

  /* The wash: the artwork's colours drifting behind the header under moving grain, gone by
     ~520 px down. Only transforms animate; --pace (how the songs feel) sets how fast. */
  .wash {
    --w1: var(--wash);
    --w2: var(--wash2);
    position: absolute;
    /* Reaches up past any notice above the header; the stage clips what's above its top. */
    inset: -240px 0 -160px;
    z-index: -1;
    overflow: hidden;
    mask-image: linear-gradient(to bottom, black 55%, transparent);
    opacity: 0;
    transition: opacity var(--dur-slow) var(--ease-out);
    pointer-events: none;
  }

  .washed .wash {
    opacity: 1;
  }

  /* Light: the wash is read at a dark level for dark themes, so here it is mixed toward paper. */
  :global([data-theme="light"]) .wash {
    --w1: color-mix(in oklab, var(--wash), white 72%);
    --w2: color-mix(in oklab, var(--wash2), white 76%);
  }

  .blob {
    position: absolute;
    border-radius: 50%;
    will-change: transform;
    /* Each blob names its own keyframes below: Svelte scopes keyframe names, so one can't travel in a variable. */
    animation: calc(var(--lap) / var(--pace, 1)) ease-in-out infinite alternate;
  }

  .blob.a {
    animation-name: wash-a;
    --lap: 34s;
    left: -12%;
    top: 0;
    width: 62%;
    height: 86%;
    background: radial-gradient(closest-side, var(--w1), transparent);
  }

  .blob.b {
    animation-name: wash-b;
    --lap: 43s;
    right: -14%;
    top: 4%;
    width: 56%;
    height: 80%;
    background: radial-gradient(closest-side, var(--w2), transparent);
  }

  .blob.c {
    animation-name: wash-c;
    --lap: 52s;
    left: 30%;
    top: 22%;
    width: 44%;
    height: 60%;
    background: radial-gradient(closest-side, color-mix(in oklab, var(--w1), var(--w2)), transparent);
    opacity: 0.6;
  }

  @keyframes wash-a {
    50% {
      transform: translate(14%, 8%) scale(1.18);
    }

    100% {
      transform: translate(30%, -4%) scale(0.92);
    }
  }

  @keyframes wash-b {
    50% {
      transform: translate(-18%, 10%) scale(0.88);
    }

    100% {
      transform: translate(-34%, -2%) scale(1.16);
    }
  }

  @keyframes wash-c {
    50% {
      transform: translate(-22%, -10%) scale(1.25);
    }

    100% {
      transform: translate(18%, 6%) scale(0.9);
    }
  }

  /* Film grain over the colour, stepping like projected film. Bigger than the wash so its steps never show an edge. */
  .grain {
    position: absolute;
    inset: -60px;
    background-image: var(--grain-strong);
    animation: grain 900ms steps(1) infinite;
  }

  @keyframes grain {
    0% {
      transform: translate(0, 0);
    }

    17% {
      transform: translate(-31px, 17px);
    }

    34% {
      transform: translate(23px, -41px);
    }

    51% {
      transform: translate(-47px, -19px);
    }

    68% {
      transform: translate(37px, 29px);
    }

    85% {
      transform: translate(-13px, 43px);
    }
  }

  /* Balanced: the same colour and grain, standing still. */
  :global([data-effects="balanced"]) :is(.blob, .grain) {
    animation: none;
  }

  .art {
    flex: none;
    width: var(--art-size);
  }


  /* Depth: the cover tilts toward the pointer as a whole and casts its shadow away from it; two
     stacked edges in the art's own deep tone read as the sides of a slab. Spotify's rules forbid
     cropping or covering artwork, so nothing is drawn over it. */
  .art {
    perspective: 1100px;
  }

  .cover {
    --lx: 0;
    --ly: 0;
    display: block;
    padding: 0;
    border-radius: var(--r-art);
    transform: rotateX(calc(var(--ly) * -9deg)) rotateY(calc(var(--lx) * 11deg));
    transition: transform 700ms var(--ease-out);
    cursor: zoom-in;
    /* Arrives, then floats: a slow sway on `translate` and `rotate`, which add to the pointer's tilt. */
    animation:
      art-in 720ms var(--ease-spring) backwards,
      sway 13s ease-in-out 720ms infinite alternate;
  }

  /* Under the pointer the sway holds still and the pointer leads. */
  .cover:hover {
    transition-duration: 160ms;
    animation-play-state: running, paused;
  }

  @keyframes sway {
    0% {
      translate: 0 2px;
      rotate: 1 0.5 0 -3deg;
    }

    50% {
      translate: 0 -5px;
      rotate: 0.3 1 0 3.4deg;
    }

    100% {
      translate: 0 1px;
      rotate: 1 -0.7 0 2.8deg;
    }
  }

  :global([data-effects="balanced"]) .cover {
    animation: art-in 720ms var(--ease-spring) backwards;
  }

  .cover :is(img, .placeholder) {
    /* The slab's sides: always showing at the bottom left, sliding as the cover leans. */
    box-shadow:
      calc(var(--lx) * -5px - 2px) 3px 0 color-mix(in oklab, var(--wash2) 70%, black),
      calc(var(--lx) * -10px - 4px) 6px 0 color-mix(in oklab, var(--wash2) 40%, black),
      calc(var(--lx) * -22px - 6px) calc(30px + var(--ly) * -18px) 54px -14px rgb(0 0 0 / 0.85),
      0 0 0 1px rgb(var(--tint) / 0.06);
    transition: box-shadow 700ms var(--ease-out);
  }

  /* The art's colour glowing on the stage beneath it, brighter while it's handled. */
  .art:not(.round) {
    position: relative;
  }

  .art:not(.round)::after {
    content: "";
    position: absolute;
    inset: 18% 6% -10%;
    z-index: -1;
    border-radius: 50%;
    background: radial-gradient(closest-side, var(--wash), transparent);
    opacity: 0.55;
    filter: blur(28px);
    transition:
      opacity var(--dur-med),
      transform var(--dur-med) var(--ease-out);
    pointer-events: none;
  }

  .art:has(.cover:hover)::after {
    opacity: 0.9;
    transform: scale(1.06);
  }

  /* Playing from here: the glow breathes. */
  .art.playing:not(.round)::after {
    animation: glow 2.6s ease-in-out infinite alternate;
  }

  @keyframes glow {
    from {
      opacity: 0.5;
      transform: scale(0.98);
    }

    to {
      opacity: 1;
      transform: scale(1.1);
    }
  }

  @keyframes art-in {
    from {
      opacity: 0;
      transform: translateY(18px) scale(0.94);
    }
  }

  :global([data-motion="none"]) .cover {
    transform: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .cover {
      transform: none;
    }
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
    background: rgb(var(--tint) / 0.08);
    text-decoration: none;
  }

  .byline :global(.avatar) {
    width: 28px;
    height: 28px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    background: rgb(var(--tint) / 0.1);
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
    background: rgb(var(--tint) / 0.08);
    box-shadow: inset 0 0 0 1px rgb(var(--tint) / 0.1);
    color: var(--text-muted);
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
    color: var(--text-muted);
    font-size: var(--fs-body);
    line-height: 1.5;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    padding: 0;
    text-align: left;
    cursor: pointer;
    transition: color var(--dur-fast);
  }

  .description:hover {
    color: var(--text);
  }

  .about {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 200px;
    gap: var(--sp-5);
  }

  .notes p {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--fs-body);
    line-height: 1.65;
    white-space: pre-line;
    user-select: text;
  }

  .notes .quiet {
    color: var(--text-faint);
  }

  .about aside {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-2);
    text-align: center;
  }

  .about aside img {
    width: 160px;
    height: 160px;
    border-radius: var(--r-art);
    object-fit: cover;
    box-shadow: var(--shadow-art);
  }

  .about strong {
    font-size: var(--fs-lead);
  }

  .about dl {
    display: grid;
    gap: 2px;
    margin: var(--sp-2) 0 0;
  }

  .about dt {
    margin-top: var(--sp-2);
    color: var(--text-faint);
    font-size: var(--fs-caption);
  }

  .about dd {
    margin: 0;
    font-weight: 650;
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
    background: rgb(var(--tint) / 0.08);
    box-shadow: var(--rim);
    color: var(--text);
    transition:
      background var(--dur-fast),
      box-shadow var(--dur-med),
      translate var(--dur-spring) var(--ease-spring),
      transform var(--dur-spring) var(--ease-spring);
  }

  .circle:hover {
    background: rgb(var(--tint) / 0.15);
    box-shadow: var(--rim-hover);
    translate: 0 -1px;
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
    transition: transform var(--dur-spring) var(--ease-spring);
  }

  /* An artwork pill is mid-tone in every theme, so its text stays ink even when Light flips --ink. */
  .washed .play {
    color: var(--accent-ink);
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
