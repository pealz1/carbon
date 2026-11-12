<script lang="ts">
  import { prefersReducedMotion } from "svelte/motion";
  import { describeError } from "$lib/errors";
  import { dotFills, withInterludes } from "$lib/interludes";
  import { activeLineIndex } from "$lib/lrc";
  import { MAX_OFFSET_MS, OFFSET_STEP_MS, offsetFor, saveOffset } from "$lib/lyric-offsets";
  import { lyricsFor, type Lyrics } from "$lib/lyrics";
  import { player } from "$lib/player.svelte";
  import type { NowSource } from "$lib/popout/now";
  import { prefs } from "$lib/preferences.svelte";
  import { needsAids, prepare, textsOf, type Aided, type RubyPart } from "$lib/romanise";
  import { detectScripts, mainScript } from "$lib/romanise/script";
  import { romanChoice, saveRomanChoice } from "$lib/romanise/song-choice";
  import { toasts } from "$lib/toast.svelte";
  import { lineProgress, LYRICS_LEAD_MS, sungFraction, wordProgress } from "$lib/words";
  import Interlude from "./Interlude.svelte";
  import Status from "./Status.svelte";

  // Synced lyrics shared by Now Playing, the docked lyrics panel, cinema mode and the lyrics pop-out
  // (which passes its mirror of the main window's player as `source`). Cinema binds `offset`,
  // because its bar nudges the timing and previews lines on the scrubber.
  let {
    variant = "page",
    source = player,
    offset = $bindable(0),
  }: { variant?: "page" | "panel" | "cinema"; source?: Pick<NowSource, "track" | "position" | "seek" | "syncPosition">; offset?: number } = $props();

  /** Where the sung line sits, as a fraction of the lyrics viewport height. */
  const FOCUS = 0.36;
  const RESYNC_MS = 1_000;
  let lyrics = $state<Lyrics | null>(null);
  let lyricsError = $state<string | null>(null);
  let clock = $state(0);
  let lineEls = $state<HTMLElement[]>([]);
  let viewport = $state<HTMLElement>();

  $effect(() => {
    const track = source.track;
    lyrics = null;
    lyricsError = null;
    if (!track) return;
    offset = offsetFor(track.id);
    songRoman = romanChoice(track.id);
    void source.syncPosition();
    let current = true;
    lyricsFor(track).then(
      (found) => current && (lyrics = found),
      (e) => {
        console.error("[lyrics]", e);
        if (current) lyricsError = describeError(e);
      },
    );
    return () => (current = false);
  });

  // Drift correction: while lyrics are on screen, re-read the SDK's local position every second.
  $effect(() => {
    const timer = setInterval(() => document.visibilityState === "visible" && void source.syncPosition(), RESYNC_MS);
    return () => clearInterval(timer);
  });

  // Smooth clock for the fill: one update per frame while this view exists.
  $effect(() => {
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

  const position = $derived(clock + LYRICS_LEAD_MS + offset);
  const lines = $derived(shown?.kind === "synced" ? withInterludes(shown.lines) : []);
  const still = $derived(prefersReducedMotion.current || prefs.value?.effects === "minimal");
  const active = $derived(activeLineIndex(lines, position));
  const shift = $derived.by(() => {
    const el = lineEls[Math.max(0, active)];
    if (!el || !viewport) return 0;
    return viewport.clientHeight * FOCUS - el.offsetTop - el.offsetHeight / 2;
  });

  function nudge(by: number) {
    if (!source.track) return;
    offset = saveOffset(source.track.id, by === 0 ? 0 : offset + by);
  }

  const seekTo = (timeMs: number) => source.seek(Math.max(0, timeMs - LYRICS_LEAD_MS - offset));
  const offsetLabel = $derived(`${offset > 0 ? "+" : offset < 0 ? "−" : "±"}${(Math.abs(offset) / 1000).toFixed(2)} s`);
</script>

<section class="lyrics {variant}" aria-label="Lyrics" bind:this={viewport}>
  {#if lyricsError}
    <Status error={lyricsError} />
  {:else if !lyrics}
    <Status loading />
  {:else if lyrics.kind === "synced"}
    <ol style="transform: translate3d(0, {shift}px, 0)">
      {#each lines as line, i (i)}
        {@const aid = aids?.get(line.text)}
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
          </button>
        </li>
      {/each}
    </ol>
  {:else if lyrics.kind === "plain" && aids?.size}
    <div class="plain">
      {#each textsOf(shown ?? lyrics) as text, k (k)}
        {@const aid = aids.get(text)}
        <p>
          {#if aid && (place === "instead" || aid.ruby)}{@render aidText(place === "instead" ? [{ text: aid.roman }] : (aid.ruby ?? []), null)}{:else}{text}{/if}
          {#if aid && place === "below"}<span class="roman">{aid.roman}</span>{/if}
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

  {#if songScript}
    <button class="romanise glass" class:raised={lyrics?.kind === "synced" && variant !== "cinema"} aria-pressed={romanOn} onclick={toggleRoman} title="{romanOn ? 'Hide' : 'Show'} {AID_NAMES[songScript]} for this song">
      {AID_NAMES[songScript]}
    </button>
  {/if}

  {#if lyrics?.kind === "synced" && variant !== "cinema"}
    <div class="sync glass" role="group" aria-label="Lyrics timing for this song">
      <button onclick={() => nudge(-OFFSET_STEP_MS)} disabled={offset <= -MAX_OFFSET_MS} aria-label="Show lyrics 0.25 seconds earlier" title="Earlier">−</button>
      <button class="value tabular" onclick={() => nudge(0)} disabled={offset === 0} title="Reset" aria-label="Lyrics offset {offsetLabel}. Reset">
        {offsetLabel}
      </button>
      <button onclick={() => nudge(OFFSET_STEP_MS)} disabled={offset >= MAX_OFFSET_MS} aria-label="Show lyrics 0.25 seconds later" title="Later">+</button>
    </div>
  {/if}
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

  .sync {
    position: absolute;
    right: var(--sp-2);
    bottom: var(--sp-5);
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 2px;
    border-radius: var(--r-pill);
    opacity: 0.4;
    transition: opacity var(--dur-fast);
  }

  .lyrics:hover .sync,
  .sync:focus-within {
    opacity: 1;
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
  /* Romanisation: a smaller line under the original that fills with it, readings over kanji, and the
     per-song switch above the timing control. */
  .roman {
    display: block;
    margin-top: 0.18em;
    font-size: 0.56em;
    font-weight: 600;
    line-height: 1.3;
    letter-spacing: 0;
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

  .romanise {
    position: absolute;
    right: var(--sp-2);
    bottom: var(--sp-5);
    height: 32px;
    padding: 0 var(--sp-3);
    border-radius: var(--r-pill);
    color: var(--text-muted);
    font-size: var(--fs-micro);
    font-weight: 700;
    opacity: 0.4;
    transition: opacity var(--dur-fast);
  }

  .romanise.raised {
    bottom: calc(var(--sp-5) + 40px);
  }

  .romanise[aria-pressed="true"] {
    color: var(--accent);
  }

  .lyrics:hover .romanise,
  .romanise:focus-visible {
    opacity: 1;
  }
</style>
