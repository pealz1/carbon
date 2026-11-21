<script lang="ts">
  // Bars for what Carbon's own engine is playing (local files only). The engine works the
  // spectrum out only while someone asks, so this asks while it is mounted and the window can be
  // seen, and stops the moment either ends. With motion turned down it draws nothing at all.
  import { prefersReducedMotion } from "svelte/motion";
  import { followSpectrum } from "$lib/local/spectrum";
  import { onScreen } from "$lib/on-screen.svelte";
  import { prefs } from "$lib/preferences.svelte";

  const BANDS = 32;
  /** A resting bar stays a hairline rather than vanishing. */
  const REST = 0.03;
  const flat = () => Array<number>(BANDS).fill(0);

  let levels = $state(flat());
  // Follows Settings live: Minimal effects, Motion "None" and game mode all still it.
  const calm = $derived(prefersReducedMotion.current || prefs.effects === "minimal" || prefs.motion === "none");

  $effect(() => {
    if (calm || !onScreen.current) return;
    const stop = followSpectrum((bands) => (levels = bands));
    return () => {
      stop();
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
