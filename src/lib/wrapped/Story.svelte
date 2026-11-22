<script lang="ts" module>
  export interface Slide {
    id: string;
    /** Artwork whose colours wash the slide. Without one the wash is graphite. */
    image: string | null;
  }

  const SLIDE_MS = 6000;
  /** A press this long is a hold, which only pauses. Anything shorter is a tap. */
  const HOLD_MS = 250;
  /** A frame that arrives late (a stalled or covered window) counts as this much at most. */
  const MAX_FRAME_MS = 100;
</script>

<script lang="ts" generics="T extends Slide">
  import { untrack, type Snippet } from "svelte";
  import { prefersReducedMotion } from "svelte/motion";
  import { artTones } from "$lib/art-tones.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import { onScreen } from "$lib/on-screen.svelte";
  import { prefs } from "$lib/preferences.svelte";
  import { isActivatable } from "$lib/shortcuts";
  import { css } from "$lib/wallpaper";
  import Frame from "./Frame.svelte";
  import { provideStory } from "./story";
  import Wash from "./Wash.svelte";

  // A story over the whole window, the way a phone shows them: one slide at a time, a segmented
  // bar that fills as the slide's time runs, a tap on the right to go on and on the left to go
  // back. A native <dialog>, so Esc, the focus trap and the top layer come for free. It stays dark
  // under every theme. This component owns the chrome, the clock and the keys; the slides are the
  // caller's.
  let {
    slides,
    chapter,
    label,
    onclose,
    slide,
  }: {
    slides: T[];
    /** Which story this is (the year). A new one starts again from the first slide. */
    chapter: string | number;
    label: string;
    onclose: () => void;
    slide: Snippet<[T]>;
  } = $props();

  let dialog = $state<HTMLDialogElement>();
  let index = $state(0);
  /** How long the slide has been showing. Only the frame clock below moves it. */
  let elapsed = $state(0);
  let paused = $state(false);
  let held = $state(false);
  /** The button or link under the pointer: resting on one holds the slide. */
  let control = $state.raw<Element | null>(null);

  const calm = $derived(prefersReducedMotion.current || prefs.effects === "minimal" || prefs.motion === "none");
  const current = $derived(slides[Math.min(index, slides.length - 1)]);
  const last = $derived(index >= slides.length - 1);
  const running = $derived(!paused && !held && !control && onScreen.current && !(last && elapsed >= SLIDE_MS));
  const tones = artTones(() => current.image);
  const colors = $derived<[string, string] | null>(tones.current ? [css(tones.current.fields[0]), css(tones.current.fields[1])] : null);

  provideStory({
    get elapsed() {
      return elapsed;
    },
    get calm() {
      return calm;
    },
  });

  function go(to: number) {
    // Past the last slide there is nowhere to go: its time is simply up.
    if (to >= slides.length) return void (elapsed = SLIDE_MS);
    index = Math.max(0, to);
    elapsed = 0;
    if (!control?.closest(".chrome")) control = null; // a slide's own button went with its slide
  }

  $effect.pre(() => {
    void chapter;
    untrack(() => go(0));
  });

  // The clock: it runs on frames, so it stops with the window and can stand still mid-slide.
  $effect(() => {
    if (!running) return;
    let before = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const next = elapsed + Math.min(now - before, MAX_FRAME_MS);
      before = now;
      if (next < SLIDE_MS || last) elapsed = Math.min(next, SLIDE_MS);
      else go(index + 1);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  });

  $effect(() => {
    if (!dialog) return;
    const opener = document.activeElement as HTMLElement | null;
    dialog.showModal();
    dialog.focus(); // on the story itself, so Space goes on instead of pressing a button
    return () => opener?.focus?.();
  });

  function cancel(event: Event) {
    event.preventDefault();
    onclose();
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const space = event.key === " " && !isActivatable(event.target);
    const step = event.key === "ArrowRight" || space ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault(); // also keeps Space from reaching the player's play and pause
    go(index + step);
  }

  let downAt = 0;
  /** The click that ends a hold is not a tap. */
  let swallow = false;

  function press(event: PointerEvent) {
    held = true;
    downAt = event.timeStamp;
    swallow = false;
  }

  function release(event: PointerEvent) {
    if (!held) return;
    held = false;
    swallow = event.type === "pointerup" && event.timeStamp - downAt >= HOLD_MS;
  }

  function tap(step: number) {
    if (swallow) return void (swallow = false);
    go(index + step);
  }

  /** The two halves of the stage: a hold pauses, and a click never takes focus from the story. */
  const zone = {
    onmousedown: (event: MouseEvent) => event.preventDefault(),
    onpointerdown: press,
    onpointerup: release,
    onpointercancel: release,
    onpointerleave: release,
  };

  const controlAt = (event: PointerEvent) => (event.target instanceof Element ? event.target.closest("button:not(.zone), a") : null);
  const fill = (i: number) => (i < index ? 1 : i > index ? 0 : elapsed / SLIDE_MS);
</script>

<!-- Keys and hover are read once for the whole story, wherever inside it they happen. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog
  bind:this={dialog}
  class="story keep-dark"
  tabindex="-1"
  aria-label={label}
  style:--tone={tones.current ? css(tones.current.pill) : null}
  oncancel={cancel}
  {onclose}
  {onkeydown}
  onpointerover={(e) => (control = controlAt(e))}
  onpointerout={() => (control = null)}
>
  <Wash {colors} {calm} still={!onScreen.current} />

  <header class="chrome" data-tauri-drag-region>
    <div class="progress" role="img" aria-label="Slide {index + 1} of {slides.length}">
      {#each slides as s, i (s.id)}
        <span class="segment"><span class="fill" style:transform="scaleX({fill(i)})"></span></span>
      {/each}
    </div>
    <p class="label">{label}</p>
    <div class="controls">
      <button class="round" onclick={() => (paused = !paused)} aria-label={paused ? "Play" : "Pause"}>
        <Icon name={paused ? "play" : "pause"} size={16} />
      </button>
      <button class="round" onclick={onclose} aria-label="Close"><Icon name="close" size={18} /></button>
    </div>
  </header>

  <button class="zone back" aria-label="Previous" {...zone} onclick={() => tap(-1)}></button>
  <button class="zone on" aria-label="Next" {...zone} onclick={() => tap(1)}></button>

  <div class="stage" aria-live="polite">
    {#key `${chapter}:${index}`}
      <Frame>{@render slide(current)}</Frame>
    {/key}
  </div>
</dialog>

<style>
  .story {
    --chrome-h: 76px;
    --tone: var(--accent);
    /* The story's own sizes, as multiples of the type scale. A tall, wide window gets the larger set. */
    --figure: calc(var(--fs-title) * 2.8);
    --display: calc(var(--fs-title) * 1.2);
    --measure: 1000px;
    --art: min(46vh, 440px);
    --thumb: 52px;
    width: 100vw;
    height: 100vh;
    max-width: none;
    max-height: none;
    margin: 0;
    padding: 0;
    border: 0;
    overflow: hidden;
    background: var(--graphite-950);
    color: var(--text);
  }

  /* Focus rests on the story itself between taps; it is not a control, so it draws no ring. */
  .story:focus-visible {
    outline: none;
  }

  @media (min-width: 1500px) and (min-height: 900px) {
    .story {
      --figure: calc(var(--fs-title) * 4.2);
      --display: calc(var(--fs-title) * 1.8);
      --measure: 1240px;
      --thumb: 64px;
    }
  }

  .chrome {
    position: absolute;
    inset: 0 0 auto;
    z-index: 3;
    height: var(--chrome-h);
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: auto 1fr;
    align-items: center;
    column-gap: var(--sp-4);
    padding: var(--sp-3) var(--sp-4) 0;
  }

  .progress {
    grid-column: 1 / -1;
    display: flex;
    gap: var(--sp-1);
    pointer-events: none;
  }

  .segment {
    flex: 1;
    height: 3px;
    border-radius: var(--r-pill);
    background: var(--glass-edge-top);
    overflow: hidden;
  }

  .fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--text);
    transform-origin: left;
  }

  .label {
    margin: 0;
    color: var(--chrome-text-muted);
    font-size: var(--fs-small);
    font-weight: 600;
    pointer-events: none;
  }

  .controls {
    display: flex;
    gap: var(--sp-2);
  }

  .round {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border-radius: var(--r-pill);
    background: var(--chrome-field);
    box-shadow: var(--rim);
    color: var(--chrome-text);
    transition:
      background var(--dur-fast),
      transform var(--dur-spring) var(--ease-spring);
  }

  .round:hover {
    background: var(--chrome-active);
  }

  /* Back takes the left third and on takes the rest, under the slide's text and over the wash. */
  .zone {
    position: absolute;
    top: var(--chrome-h);
    bottom: 0;
    z-index: 1;
    cursor: default;
  }

  .zone.back {
    left: 0;
    width: calc(100% / 3);
  }

  .zone.on {
    left: calc(100% / 3);
    right: 0;
  }

  /* A zone has nothing to press in: it must not shrink away from the pointer that holds it. */
  .zone:active {
    transform: none;
  }

  .zone:focus-visible {
    outline-offset: calc(var(--sp-2) * -1);
    border-radius: var(--r-lg);
  }

  /* Slides lie over the zones and let taps through (Frame.svelte); only their own buttons take the pointer. */
  .stage {
    position: absolute;
    inset: var(--chrome-h) 0 0;
    z-index: 2;
    pointer-events: none;
  }
</style>
