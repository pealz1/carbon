<script lang="ts">
  // Bars for what Carbon's own engine is playing (local files only). The engine works the
  // spectrum out only while someone asks, so this asks while it is mounted and the window can be
  // seen, and stops the moment either ends. With motion turned down it draws nothing at all.
  import { onMount } from "svelte";
  import { engine } from "$lib/local/api";
  import { onScreen } from "$lib/on-screen.svelte";

  const BANDS = 32;
  /** Well inside the engine's five-second lease, so a visualizer on screen never lapses. */
  const RENEW_MS = 2000;
  /** A resting bar stays a hairline rather than vanishing. */
  const REST = 0.03;
  const flat = () => Array<number>(BANDS).fill(0);

  let levels = $state(flat());
  let calm = $state(true);

  onMount(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const read = () => (calm = reduced.matches || document.documentElement.dataset.effects === "minimal");
    read();
    reduced.addEventListener("change", read);
    return () => reduced.removeEventListener("change", read);
  });

  $effect(() => {
    if (calm || !onScreen.current) return;
    const ask = (on: boolean) => engine.spectrum(on).catch((e) => console.warn("[visualizer] couldn't reach the engine", e));
    void ask(true);
    const renewing = setInterval(() => void ask(true), RENEW_MS);
    const listening = engine.onSpectrum((bands) => (levels = bands));
    return () => {
      clearInterval(renewing);
      void ask(false);
      void listening.then((stop) => stop());
      levels = flat();
    };
  });
</script>

{#if !calm}
  <div class="visualizer" aria-hidden="true">
    {#each levels as level, band (band)}
      <span style:transform="scaleY({Math.max(REST, level)})" style:opacity={0.45 + 0.55 * level}></span>
    {/each}
  </div>
{/if}

<style>
  /* Height comes from the place it's mounted: set --visualizer-h there. */
  .visualizer {
    display: flex;
    align-items: flex-end;
    gap: calc(var(--sp-1) / 2);
    height: var(--visualizer-h, var(--sp-6));
    contain: layout paint;
  }

  span {
    flex: 1;
    height: 100%;
    background: linear-gradient(to top, var(--accent-strong), var(--accent));
    transform-origin: bottom;
    /* The engine sends about 30 spectra a second; gliding between them hides the steps. */
    transition:
      transform var(--dur-press) linear,
      opacity var(--dur-press) linear;
  }
</style>
