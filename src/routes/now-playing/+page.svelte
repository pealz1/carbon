<script lang="ts">
  import LikeButton from "$lib/components/LikeButton.svelte";
  import Status from "$lib/components/Status.svelte";
  import { describeError } from "$lib/errors";
  import { activeLineIndex } from "$lib/lrc";
  import { lyricsFor, type Lyrics } from "$lib/lyrics";
  import { player } from "$lib/player.svelte";
  import { lineEnd, timeWords, type TimedWord } from "$lib/words";

  /** Where the sung line sits, as a fraction of the lyrics viewport height. */
  const FOCUS = 0.36;
  let lyrics = $state<Lyrics | null>(null);
  let lyricsError = $state<string | null>(null);
  let position = $state(0);
  let lineEls = $state<HTMLElement[]>([]);
  let viewport = $state<HTMLElement>();
  let tilt = $state({ x: 0, y: 0 });

  $effect(() => {
    const track = player.track;
    lyrics = null;
    lyricsError = null;
    if (!track) return;
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

  // Smooth clock for the word fill: one CSS variable per frame, only while visible and playing.
  $effect(() => {
    let frame = 0;
    const loop = () => {
      position = player.position();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  });

  const lines = $derived(lyrics?.kind === "synced" ? lyrics.lines : []);
  const words = $derived<TimedWord[][]>(lines.map((l, i) => timeWords(l.text, l.timeMs, lineEnd(lines, i))));
  const active = $derived(activeLineIndex(lines, position));
  const offset = $derived.by(() => {
    const el = lineEls[Math.max(0, active)];
    if (!el || !viewport) return 0;
    return viewport.clientHeight * FOCUS - el.offsetTop - el.offsetHeight / 2;
  });

  function onTilt(event: PointerEvent) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    tilt = { x: ((event.clientY - rect.top) / rect.height - 0.5) * -10, y: ((event.clientX - rect.left) / rect.width - 0.5) * 12 };
  }
</script>

<div class="stage">
  {#if player.track}
    <section class="art-side">
      <div class="cover-wrap" role="presentation" onpointermove={onTilt} onpointerleave={() => (tilt = { x: 0, y: 0 })}>
        {#if player.artwork}
          <img class="cover" src={player.artwork} alt="" width="440" height="440" style="transform: rotateX({tilt.x}deg) rotateY({tilt.y}deg)" />
        {/if}
      </div>
      <div class="title-row">
        <h1>{player.track.name}</h1>
        <LikeButton uri={player.track.uri} label={player.track.name} size={22} />
      </div>
      <p class="by">{player.track.artists.map((a) => a.name).join(", ")}</p>
      {#if player.track.album}<p class="album">{player.track.album.name}</p>{/if}
    </section>

    <section class="lyrics" aria-label="Lyrics" bind:this={viewport}>
      {#if lyricsError}
        <Status error={lyricsError} />
      {:else if !lyrics}
        <Status loading />
      {:else if lyrics.kind === "synced"}
        <ol style="transform: translate3d(0, {offset}px, 0)">
          {#each lines as line, i (i)}
            <li bind:this={lineEls[i]} class:active={i === active} class:past={i < active} class:near={Math.abs(i - active) === 1}>
              <button onclick={() => player.seek(line.timeMs)} aria-current={i === active ? "true" : undefined}>
                {#if !line.text}
                  <span class="breath" aria-label="Instrumental break"><i></i><i></i><i></i></span>
                {:else if i === active}
                  {#each words[i] as word, w (w)}
                    <span class="word" style="--p: {Math.min(1, Math.max(0, (position - word.startMs) / word.durationMs))}">{word.text}</span>{" "}
                  {/each}
                {:else}
                  {line.text}
                {/if}
              </button>
            </li>
          {/each}
        </ol>
      {:else if lyrics.kind === "plain"}
        <p class="plain">{lyrics.text}</p>
      {:else if lyrics.kind === "instrumental"}
        <p class="note">Instrumental. Just listen.</p>
      {:else}
        <p class="note">No lyrics found for this song.</p>
      {/if}
    </section>
  {:else}
    <Status empty="Play something to see it here, with lyrics." />
  {/if}
</div>

<style>
  .stage {
    display: grid;
    grid-template-columns: minmax(280px, 0.85fr) minmax(0, 1.35fr);
    gap: var(--sp-7);
    height: calc(100vh - var(--titlebar-h) - var(--dock-h) - var(--sp-6));
    padding: var(--sp-5) var(--sp-4) 0;
  }

  .art-side {
    align-self: center;
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .cover-wrap {
    perspective: 900px;
    margin-bottom: var(--sp-4);
  }

  .cover {
    width: 100%;
    max-width: 440px;
    height: auto;
    aspect-ratio: 1;
    border-radius: var(--r-lg);
    object-fit: cover;
    box-shadow: var(--shadow-art), 0 0 0 1px var(--glass-edge), 0 40px 120px -30px var(--accent-glow);
    transition: transform var(--dur-slow) var(--ease-out);
    will-change: transform;
  }

  .title-row {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-3);
  }

  .title-row :global(.like) {
    margin-top: var(--sp-1);
  }

  h1 {
    font-size: var(--fs-title);
    font-weight: 750;
    line-height: 1.05;
  }

  .by {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .album {
    margin: 0;
    color: var(--text-faint);
  }

  .lyrics {
    position: relative;
    min-height: 0;
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
    font-family: var(--font-display);
    font-size: calc(clamp(1.6rem, 2.4vw, 2.4rem) * var(--lyrics-scale, 1));
    font-weight: 780;
    line-height: 1.18;
    letter-spacing: -0.02em;
    color: var(--text);
    opacity: 0.22;
    filter: blur(1.4px);
    transform: scale(0.96);
    transform-origin: left center;
    transition:
      opacity var(--dur-med) var(--ease-out),
      transform 700ms var(--ease-spring);
  }

  li.near button {
    opacity: 0.38;
    filter: blur(0.6px);
  }

  li.past button {
    opacity: 0.16;
  }

  li.active button {
    opacity: 1;
    filter: none;
    transform: scale(1);
  }

  li button:hover {
    opacity: 0.8;
    filter: none;
    background: var(--glass-hover);
  }

  /* Liquid fill: each word lights up left-to-right as it's sung, with a soft glow. */
  .word {
    background: linear-gradient(90deg, var(--text) calc(var(--p) * 100%), rgb(255 255 255 / 0.32) calc(var(--p) * 100% + 6%));
    background-clip: text;
    -webkit-background-clip: text;
    color: transparent;
    text-shadow: 0 0 calc(var(--p) * 24px) rgb(255 255 255 / calc(var(--p) * 0.35));
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
    font-family: var(--font-display);
    font-size: var(--fs-title);
    font-weight: 700;
    color: var(--text-muted);
  }
</style>
