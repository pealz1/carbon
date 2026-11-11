<script lang="ts">
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { fade } from "svelte/transition";
  import { artTones } from "$lib/art-tones.svelte";
  import { css } from "$lib/wallpaper";

  // The window's wallpaper: the chrome is drawn straight on it. Black with nothing loaded; with a
  // track, four colour fields read from its artwork (never the artwork itself) drift slowly and
  // cross-fade when the song changes. Only transform and opacity animate.
  let { image, playing }: { image: string | null; playing: boolean } = $props();
  const tones = artTones(() => image);
  let hidden = $state(false);
  let minimized = $state(false);

  // The page stays "visible" when the window is minimized or hidden to the tray, so ask the window too.
  $effect(() => {
    const win = getCurrentWindow();
    const sync = () =>
      Promise.all([win.isMinimized(), win.isVisible()]).then(
        ([min, visible]) => (minimized = min || !visible),
        (e) => console.warn("[wallpaper] couldn't read the window state", e),
      );
    void sync();
    const listening = [win.onResized(sync), win.onFocusChanged(sync)];
    return () => listening.forEach((off) => void off.then((stop) => stop()));
  });

  const style = $derived(tones.current ? tones.current.fields.map((f, i) => `--f${i}: ${css(f)}`).join("; ") : null);
</script>

<svelte:document onvisibilitychange={() => (hidden = document.visibilityState === "hidden")} />

<div class="wallpaper" class:paused={hidden || minimized} aria-hidden="true">
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

  /* Each field is drawn at half size and scaled 2x: a soft gradient loses nothing, and the GPU
     composites a quarter of the pixels every frame. */
  .field {
    position: absolute;
    width: 38vmax;
    height: 38vmax;
    border-radius: 50%;
    transform: scale(2);
    will-change: transform;
  }

  .a {
    left: -7vmax;
    top: -15vmax;
    background: radial-gradient(closest-side, var(--f0), transparent);
    animation: drift-a 46s var(--ease-out) infinite alternate;
  }

  .b {
    right: -11vmax;
    top: -19vmax;
    background: radial-gradient(closest-side, var(--f1), transparent);
    animation: drift-b 58s var(--ease-out) infinite alternate;
  }

  .c {
    left: -11vmax;
    bottom: -21vmax;
    background: radial-gradient(closest-side, var(--f3), transparent);
    animation: drift-c 52s var(--ease-out) infinite alternate;
  }

  .d {
    right: -5vmax;
    bottom: -25vmax;
    background: radial-gradient(closest-side, var(--f0), transparent);
    animation: drift-d 64s var(--ease-out) infinite alternate;
  }

  @keyframes drift-a {
    to {
      transform: translate3d(18vmax, 8vmax, 0) scale(2.24);
    }
  }

  @keyframes drift-b {
    to {
      transform: translate3d(-22vmax, 10vmax, 0) scale(1.8);
    }
  }

  @keyframes drift-c {
    to {
      transform: translate3d(16vmax, -6vmax, 0) scale(2.3);
    }
  }

  @keyframes drift-d {
    to {
      transform: translate3d(-20vmax, -8vmax, 0) scale(1.84);
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
