<script lang="ts">
  import { untrack } from "svelte";
  import { prefersReducedMotion } from "svelte/motion";
  import { describeError } from "$lib/errors";
  import { dotFills, withInterludes } from "$lib/interludes";
  import { activeLineIndex } from "$lib/lrc";
  import { delayLabel, MAX_OFFSET_MS, nudged, offsetFor, saveOffset } from "$lib/lyric-offsets";
  import { foundFor, sourcesFor, type Found } from "$lib/lyrics";
  import { copyLyrics, saveLyrics } from "$lib/lyrics/actions";
  import { chooseSource, isSource, SOURCE_NAMES, sourceChoice, untranslated } from "$lib/lyrics/sources.svelte";
  import { translationFor } from "$lib/lyrics/translate";
  import { onScreen } from "$lib/on-screen.svelte";
  import { player } from "$lib/player.svelte";
  import type { NowSource } from "$lib/popout/now";
  import { prefs } from "$lib/preferences.svelte";
  import { needsAids, prepare, textsOf, type Aided, type RubyPart } from "$lib/romanise";
  import { detectScripts, mainScript } from "$lib/romanise/script";
  import { romanChoice, saveRomanChoice } from "$lib/romanise/song-choice";
  import { toasts } from "$lib/toast.svelte";
  import { lineProgress, lyricShift, sungFraction, wordProgress } from "$lib/words";
  import Icon from "./Icon.svelte";
  import Interlude from "./Interlude.svelte";
  import Status from "./Status.svelte";

  // Synced lyrics shared by Now Playing, the docked lyrics panel, cinema mode and the lyrics pop-out
  // (which passes its mirror of the main window's player as `source`). Cinema binds `offset`,
  // because its bar nudges the timing and previews lines on the scrubber.
  let {
    variant = "page",
    source = player,
    offset = $bindable(0),
  }: { variant?: "page" | "panel" | "cinema"; source?: Pick<NowSource, "track" | "paused" | "position" | "seek" | "syncPosition">; offset?: number } = $props();

  /** Where the sung line sits, as a fraction of the lyrics viewport height. */
  const FOCUS = 0.36;
  const RESYNC_MS = 1_000;
  /** Paused, the position only moves on a seek: a slow tick is enough to follow it. */
  const PAUSED_TICK_MS = 250;
  /** How long the copy button shows its tick. */
  const COPIED_MS = 1_600;
  let found = $state.raw<Found | null>(null);
  const lyrics = $derived(found?.lyrics ?? null);
  let lyricsError = $state<string | null>(null);
  let clock = $state(0);
  let lineEls = $state<HTMLElement[]>([]);
  let viewport = $state<HTMLElement>();

  $effect(() => {
    const track = source.track;
    found = null;
    lyricsError = null;
    if (!track) return;
    offset = offsetFor(track.id);
    songRoman = romanChoice(track.id);
    translateOff = untranslated.get(track.id) === true;
    askedToTranslate = false;
    void source.syncPosition();
    let current = true;
    // Follows the source order in Settings and this song's own source, so a switch looks it up again.
    foundFor(track).then(
      (result) => current && (found = result),
      (e) => {
        console.error("[lyrics]", e);
        if (current) lyricsError = describeError(e);
      },
    );
    return () => (current = false);
  });

  // The clock only runs for synced lyrics, while they can be seen: nothing ticks in the tray.
  const ticking = $derived(lyrics?.kind === "synced" && onScreen.current);

  // Drift correction: while synced lyrics play on screen, re-read the SDK's local position every second.
  $effect(() => {
    if (!ticking || source.paused) return;
    const timer = setInterval(() => void source.syncPosition(), RESYNC_MS);
    return () => clearInterval(timer);
  });

  // Smooth clock for the fill: one update per frame while the song plays, a slow tick while paused.
  $effect(() => {
    if (!ticking) return;
    clock = untrack(() => source.position()); // read once now; the loop below follows it, not this effect
    if (source.paused) {
      const timer = setInterval(() => (clock = source.position()), PAUSED_TICK_MS);
      return () => clearInterval(timer);
    }
    let frame = 0;
    const loop = () => {
      clock = source.position();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  });

  // Romanisation: the original shows at once; romanised and converted text follows when it's ready.
  const AID_NAMES = { ja: "Rōmaji", zh: "Pinyin", ko: "Romaja" } as const;
  let songRoman = $state<boolean | undefined>();
  let aided = $state.raw<Aided | null>(null);
  const scripts = $derived(lyrics ? detectScripts(textsOf(lyrics)) : []);
  const songScript = $derived(mainScript(scripts));
  const romanOn = $derived(songRoman ?? prefs.value?.lyricsRomanise ?? false);
  const place = $derived(prefs.value?.lyricsRomanPlace ?? "below");
  // Plain values, so saving an unrelated setting doesn't redo the work.
  const furigana = $derived(romanOn && place === "below" && !!prefs.value?.lyricsFurigana);
  const chinese = $derived(prefs.value?.lyricsChinese ?? "original");

  $effect(() => {
    const [found, options] = [lyrics, { romanise: romanOn, furigana, chinese }];
    aided = null;
    if (!found || !needsAids(scripts, options)) return;
    let current = true;
    prepare(found, options).then(
      (result) => current && (aided = result),
      (e) => {
        console.error("[lyrics] romanisation failed", e);
        if (current) toasts.error("Couldn't romanise these lyrics.");
      },
    );
    return () => (current = false);
  });

  const shown = $derived(aided?.lyrics ?? lyrics);
  const aids = $derived(aided?.aids);

  function toggleRoman() {
    if (source.track) songRoman = saveRomanChoice(source.track.id, !romanOn, prefs.value?.lyricsRomanise ?? false);
  }

  // The source these lyrics came from, and the others this song can be switched to.
  const sources = $derived(source.track ? sourcesFor(source.track) : []);
  const chosen = $derived(source.track ? sourceChoice(source.track.id) : undefined);
  const hasText = $derived(lyrics?.kind === "synced" || lyrics?.kind === "plain");
  let copied = $state(false);

  function pickSource(value: string) {
    if (source.track) chooseSource(source.track.id, isSource(value) ? value : undefined);
  }

  async function copy() {
    if (!lyrics || !(await copyLyrics(lyrics))) return;
    copied = true;
    setTimeout(() => (copied = false), COPIED_MS);
  }

  // Translation: a line under each lyric line, in the language chosen in Settings; a song can opt out.
  const target = $derived(prefs.value?.lyricsTranslate ?? "");
  let translateOff = $state(false);
  let translated = $state.raw<Map<string, string> | null>(null);
  /** The listener just pressed the chip, so a failure is worth telling them about. */
  let askedToTranslate = false;
  const translateOn = $derived(!!target && !translateOff);

  $effect(() => {
    const [what, to] = [found, target];
    translated = null;
    const track = untrack(() => source.track);
    if (!what || !translateOn || !track) return;
    let current = true;
    translationFor(track, what, to).then(
      (lines) => current && (translated = lines),
      (e) => {
        console.warn("[lyrics] translation failed; showing the lyrics without it", e);
        if (current && askedToTranslate) toasts.error("Couldn't translate these lyrics just now.");
      },
    );
    return () => (current = false);
  });

  function toggleTranslate() {
    if (!source.track) return;
    translateOff = !translateOff;
    askedToTranslate = !translateOff;
    untranslated.set(source.track.id, translateOff || undefined);
  }

  // Keyed by the line as shown, which differs from the line as found once Chinese is converted.
  const translations = $derived.by(() => {
    if (!translated?.size || !lyrics) return null;
    const from = textsOf(lyrics);
    const pairs = textsOf(shown ?? lyrics).map((text, i) => [text, translated?.get(from[i]?.trim() ?? "")] as const);
    return new Map(pairs.filter((pair): pair is [string, string] => !!pair[1]));
  });

  const shift = $derived(lyricShift(offset, prefs.value?.lyricsDelayMs));
  const position = $derived(clock + shift);
  const lines = $derived(shown?.kind === "synced" ? withInterludes(shown.lines) : []);
  const still = $derived(prefersReducedMotion.current || prefs.value?.effects === "minimal");
  const active = $derived(activeLineIndex(lines, position));
  const scroll = $derived.by(() => {
    const el = lineEls[Math.max(0, active)];
    if (!el || !viewport) return 0;
    return viewport.clientHeight * FOCUS - el.offsetTop - el.offsetHeight / 2;
  });

  /** -1 shows this song's lyrics earlier, 1 later, 0 resets. */
  function nudge(direction: -1 | 0 | 1) {
    if (!source.track) return;
    offset = saveOffset(source.track.id, direction === 0 ? 0 : nudged(offset, direction));
  }

  const seekTo = (timeMs: number) => source.seek(Math.max(0, timeMs - shift));
  const offsetLabel = $derived(delayLabel(offset));
</script>

<section class="lyrics {variant}" aria-label="Lyrics" bind:this={viewport}>
  {#if lyricsError}
    <Status error={lyricsError} />
  {:else if !lyrics}
    <Status loading />
  {:else if lyrics.kind === "synced"}
    <ol style="transform: translate3d(0, {scroll}px, 0)">
      {#each lines as line, i (i)}
        {@const aid = aids?.get(line.text)}
        {@const translation = translations?.get(line.text)}
        {@const fill = i === active ? sungFraction(lines, i, position) : null}
        <li bind:this={lineEls[i]} class:active={i === active} class:past={i < active} class:near={Math.abs(i - active) === 1} class:far={Math.abs(i - active) > 3}>
          <button onclick={() => seekTo(line.timeMs)} aria-current={i === active ? "true" : undefined}>
            {#if line.interludeEndMs !== undefined}
              <Interlude fills={dotFills(line.timeMs, line.interludeEndMs, position, still)} live={i === active} {still} />
            {:else if !line.text}
              <span class="breath" aria-label="Instrumental break"><i></i><i></i><i></i></span>
            {:else if aid && (place === "instead" || aid.ruby)}
              {@render aidText(place === "instead" ? [{ text: aid.roman }] : (aid.ruby ?? []), fill)}
            {:else if i === active && line.words}
              {#each line.words as word, w (w)}<span class="fill" style="--p: {wordProgress(word, position)}">{word.text}</span>{/each}
            {:else if i === active}
              <span class="fill" style="--p: {lineProgress(lines, i, position)}">{line.text}</span>
            {:else}
              {line.text}
            {/if}
            {#if aid && place === "below"}<span class="roman">{@render aidText([{ text: aid.roman }], fill)}</span>{/if}
            {#if translation}<span class="roman translation">{translation}</span>{/if}
          </button>
        </li>
      {/each}
    </ol>
  {:else if lyrics.kind === "plain" && (aids?.size || translations)}
    <div class="plain">
      {#each textsOf(shown ?? lyrics) as text, k (k)}
        {@const aid = aids?.get(text)}
        {@const translation = translations?.get(text)}
        <p>
          {#if aid && (place === "instead" || aid.ruby)}{@render aidText(place === "instead" ? [{ text: aid.roman }] : (aid.ruby ?? []), null)}{:else}{text}{/if}
          {#if aid && place === "below"}<span class="roman">{aid.roman}</span>{/if}
          {#if translation}<span class="roman translation">{translation}</span>{/if}
        </p>
      {/each}
    </div>
  {:else if lyrics.kind === "plain"}
    <p class="plain">{shown?.kind === "plain" ? shown.text : lyrics.text}</p>
  {:else if lyrics.kind === "instrumental"}
    <p class="note">Instrumental. Just listen.</p>
  {:else}
    <p class="note">No lyrics found for this song.</p>
  {/if}

  <!-- This song's own switches, bottom right: where the lyrics come from, translation, romanisation,
       keeping a copy and, under them, the timing nudge. Cinema keeps most of these in its bar. -->
  <div class="chips">
    <div class="row">
      {#if sources.length > 1 && variant !== "cinema"}
        <select class="chip glass" value={chosen ?? ""} onchange={(e) => pickSource(e.currentTarget.value)} aria-label="Lyrics source for this song" title="Where these lyrics come from">
          <option value="">{!chosen && found?.source ? `Best: ${SOURCE_NAMES[found.source]}` : "Best available"}</option>
          {#each sources as id (id)}<option value={id}>{SOURCE_NAMES[id]}</option>{/each}
        </select>
      {/if}
      {#if target && hasText}
        <button class="chip glass" aria-pressed={translateOn} onclick={toggleTranslate} title="{translateOn ? 'Hide' : 'Show'} the translation for this song">Translate</button>
      {/if}
      {#if songScript}
        <button class="chip glass" aria-pressed={romanOn} onclick={toggleRoman} title="{romanOn ? 'Hide' : 'Show'} {AID_NAMES[songScript]} for this song">
          {AID_NAMES[songScript]}
        </button>
      {/if}
      {#if hasText && lyrics && source.track && variant !== "cinema"}
        {@const track = source.track}
        <button class="chip icon glass" onclick={() => saveLyrics(track, lyrics)} aria-label="Save lyrics…" title="Save lyrics…"><Icon name="export" size={14} /></button>
        <button class="chip icon glass" onclick={copy} aria-label={copied ? "Lyrics copied" : "Copy lyrics"} title={copied ? "Copied" : "Copy lyrics"}>
          <Icon name={copied ? "check" : "duplicate"} size={14} />
        </button>
      {/if}
    </div>
    {#if lyrics?.kind === "synced" && variant !== "cinema"}
      <div class="sync glass" role="group" aria-label="Lyrics timing for this song">
        <button onclick={() => nudge(-1)} disabled={offset >= MAX_OFFSET_MS} aria-label="Show lyrics 0.25 seconds earlier" title="Earlier">−</button>
        <button class="value tabular" onclick={() => nudge(0)} disabled={offset === 0} title="Reset" aria-label="Lyrics delay {offsetLabel}. Reset">
          {offsetLabel}
        </button>
        <button onclick={() => nudge(1)} disabled={offset <= -MAX_OFFSET_MS} aria-label="Show lyrics 0.25 seconds later" title="Later">+</button>
      </div>
    {/if}
  </div>
</section>

{#snippet aidText(parts: RubyPart[], fill: number | null)}
  <span class:fill={fill !== null} style:--p={fill}>{#each parts as part, k (k)}{#if part.reading}<ruby>{part.text}<rt>{part.reading}</rt></ruby>{:else}{part.text}{/if}{/each}</span>
{/snippet}

<style>
  .lyrics {
    position: relative;
    min-height: 0;
    height: 100%;
    overflow: hidden;
    mask-image: linear-gradient(transparent, black 12%, black 78%, transparent);
  }

  ol {
    list-style: none;
    margin: 0;
    padding: 0 var(--sp-2) 60vh;
    transition: transform 700ms var(--ease-spring);
    will-change: transform;
  }

  li button {
    display: block;
    width: 100%;
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--r-md);
    text-align: left;
    font-family: var(--font-lyrics);
    font-size: calc(clamp(1.75rem, 2.4cqw + 1rem, 2.5rem) * var(--lyrics-scale, 1));
    font-weight: 750;
    line-height: 1.18;
    letter-spacing: -0.02em;
    color: inherit;
    opacity: 0.3;
    filter: blur(0.8px);
    transform: scale(0.97);
    transform-origin: left center;
    transition:
      opacity var(--dur-med) var(--ease-out),
      background var(--dur-fast),
      transform 700ms var(--ease-spring);
  }

  .cinema li button {
    font-size: calc(clamp(2.4rem, 4.4vw, 4.6rem) * var(--lyrics-scale, 1));
    line-height: 1.12;
  }

  /* Docked beside the stage: 22 px lines, the sung one bright, the rest receding with distance. */
  .panel {
    mask-image: linear-gradient(transparent, black 8%, black 82%, transparent);
  }

  .panel ol {
    padding: 0 0 60vh;
  }

  .panel li button {
    padding: var(--sp-2);
    font-size: calc(1.375rem * var(--lyrics-scale, 1));
    font-weight: 700;
    line-height: 1.28;
    letter-spacing: -0.01em;
  }

  li.near button {
    opacity: 0.5;
    filter: blur(0.3px);
  }

  li.past button {
    opacity: 0.22;
  }

  li.far button {
    opacity: 0.18;
    filter: blur(1.6px);
  }

  li.active button {
    opacity: 1;
    filter: none;
    transform: scale(1);
  }

  li button:hover {
    opacity: 0.85;
    filter: none;
    background: var(--glass-hover);
  }

  :global([data-effects="minimal"]) li button,
  :global([data-lyrics-blur="off"]) li button {
    filter: none;
  }

  /* Liquid fill: text lights up left-to-right as it's sung, with a soft glow. */
  .fill {
    background: linear-gradient(90deg, var(--text) calc(var(--p) * 100%), rgb(255 255 255 / 0.32) calc(var(--p) * 100% + 6%));
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
    color: transparent;
    text-shadow: 0 0 calc(var(--p) * 24px) rgb(255 255 255 / calc(var(--p) * 0.35));
    white-space: pre-wrap;
  }

  .breath {
    display: inline-flex;
    gap: 8px;
    padding: var(--sp-2) 0;
  }

  .breath i {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--text);
    animation: breathe 1.6s var(--ease-out) infinite alternate;
  }

  .breath i:nth-child(2) {
    animation-delay: 0.25s;
  }

  .breath i:nth-child(3) {
    animation-delay: 0.5s;
  }

  @keyframes breathe {
    from {
      opacity: 0.3;
      transform: scale(0.7);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .plain {
    white-space: pre-line;
    font-size: 1.25rem;
    line-height: 1.7;
    color: var(--text-muted);
    user-select: text;
    overflow-y: auto;
    max-height: 100%;
  }

  .note {
    font-family: var(--font-lyrics);
    font-size: var(--fs-title);
    font-weight: 700;
    color: var(--text-muted);
  }

  .chips {
    position: absolute;
    inset: auto var(--sp-2) var(--sp-5);
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--sp-2);
    pointer-events: none; /* the lines under its gaps stay clickable */
    opacity: 0.4;
    transition: opacity var(--dur-fast);
  }

  .lyrics:hover .chips,
  .chips:focus-within {
    opacity: 1;
  }

  .row {
    display: flex;
    flex-wrap: wrap-reverse;
    justify-content: flex-end;
    gap: var(--sp-2);
  }

  .row > *,
  .sync {
    pointer-events: auto;
  }

  .chip {
    height: 32px;
    padding: 0 var(--sp-3);
    border-radius: var(--r-pill);
    color: var(--text-muted);
    font-size: var(--fs-micro);
    font-weight: 700;
    transition:
      color var(--dur-fast),
      transform var(--dur-press) var(--ease-out);
  }

  .chip:hover {
    color: var(--text);
  }

  .chip:active {
    transform: scale(var(--press));
  }

  .chip[aria-pressed="true"] {
    color: var(--accent);
  }

  .chip.icon {
    width: 32px;
    padding: 0;
    display: grid;
    place-items: center;
  }

  select.chip {
    max-width: 168px;
    cursor: pointer;
  }

  .sync {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 2px;
    border-radius: var(--r-pill);
  }

  .sync button {
    min-width: 30px;
    height: 28px;
    padding: 0 var(--sp-2);
    border-radius: var(--r-pill);
    color: var(--text-muted);
    font-weight: 700;
  }

  .sync button:hover:not(:disabled) {
    color: var(--text);
    background: var(--glass-hover);
  }

  .sync button:disabled {
    cursor: default;
  }

  .sync .value {
    font-size: var(--fs-micro);
    font-weight: 600;
  }
  /* Romanisation: a smaller line under the original that fills with it, and readings over kanji.
     A translation takes the same slot, a step quieter, under any romanisation. */
  .roman {
    display: block;
    margin-top: 0.18em;
    font-size: 0.56em;
    font-weight: 600;
    line-height: 1.3;
    letter-spacing: 0;
  }

  .translation {
    font-weight: 500;
    opacity: 0.78;
  }

  rt {
    font-size: 0.42em;
    font-weight: 600;
    letter-spacing: 0;
  }

  .plain p {
    min-height: 1lh;
    margin: 0;
  }

  .plain .roman {
    margin-top: 0;
    font-size: 0.8em;
    color: var(--text-faint);
  }
</style>
