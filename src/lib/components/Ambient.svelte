<script lang="ts">
  import { fade } from "svelte/transition";
  import { artTones } from "$lib/art-tones.svelte";
  import { css } from "$lib/wallpaper";

  // The window's wallpaper: the chrome is drawn straight on it. Black with nothing loaded; with a
  // track, four colour fields read from its artwork (never the artwork itself) drift slowly and
  // cross-fade when the song changes. Only transform and opacity animate.
  let { image, playing }: { image: string | null; playing: boolean } = $props();
  const tones = artTones(() => image);
  let hidden = $state(false);

  const style = $derived(tones.current ? tones.current.fields.map((f, i) => `--f${i}: ${css(f)}`).join("; ") : null);
</script>

<svelte:document onvisibilitychange={() => (hidden = document.visibilityState === "hidden")} />

<div class="wallpaper" class:paused={hidden} aria-hidden="true">
  {#key style}
    {#if style}
      <div class="wash" class:dim={!playing} {style} in:fade={{ duration: 1400 }} out:fade={{ duration: 1400 }}>
        <span class="field a"></span>
        <span class="field b"></span>
        <span class="field c"></span>
        <span class="field d"></span>
      </div>
    {/if}
  {/key}
  <div class="grain"></div>
</div>

<style>
  .wallpaper {
    position: fixed;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    pointer-events: none;
    background: var(--black);
  }

  .wash,
  .grain {
    position: absolute;
    inset: 0;
  }

  /* The deepest tone fills the gaps between fields, so the chrome reads as one continuous wash. */
  .wash {
    background: var(--f2);
    transition: opacity var(--dur-slow) var(--ease-out);
  }

  /* Paused keeps the colour but lowers it, so the frame itself says whether music is playing. */
  .wash.dim {
    opacity: 0.55;
  }

  .field {
    position: absolute;
    width: 76vmax;
    height: 76vmax;
    border-radius: 50%;
    will-change: transform;
  }

  .a {
    left: -26vmax;
    top: -34vmax;
    background: radial-gradient(closest-side, var(--f0), transparent);
    animation: drift-a 46s var(--ease-out) infinite alternate;
  }

  .b {
    right: -30vmax;
    top: -38vmax;
    background: radial-gradient(closest-side, var(--f1), transparent);
    animation: drift-b 58s var(--ease-out) infinite alternate;
  }

  .c {
    left: -30vmax;
    bottom: -40vmax;
    background: radial-gradient(closest-side, var(--f3), transparent);
    animation: drift-c 52s var(--ease-out) infinite alternate;
  }

  .d {
    right: -24vmax;
    bottom: -44vmax;
    background: radial-gradient(closest-side, var(--f0), transparent);
    animation: drift-d 64s var(--ease-out) infinite alternate;
  }

  @keyframes drift-a {
    to {
      transform: translate3d(18vmax, 8vmax, 0) scale(1.12);
    }
  }

  @keyframes drift-b {
    to {
      transform: translate3d(-22vmax, 10vmax, 0) scale(0.9);
    }
  }

  @keyframes drift-c {
    to {
      transform: translate3d(16vmax, -6vmax, 0) scale(1.15);
    }
  }

  @keyframes drift-d {
    to {
      transform: translate3d(-20vmax, -8vmax, 0) scale(0.92);
    }
  }

  .paused .field {
    animation-play-state: paused;
  }

  /* Film grain: on the wallpaper, so it shows on the chrome and never on artwork above it. */
  .grain {
    background-image: var(--grain);
  }

  /* Balanced: the same light, standing still. */
  :global([data-effects="balanced"]) .field {
    animation: none;
  }

  /* Minimal: one flat tone, no fields, no grain. */
  :global([data-effects="minimal"]) .field,
  :global([data-effects="minimal"]) .grain {
    display: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .field {
      animation: none;
    }
  }
</style>
