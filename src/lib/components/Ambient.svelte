<script lang="ts">
  import { fade } from "svelte/transition";
  import { paletteFrom, type Rgb } from "$lib/palette";

  // The window's light: blurred artwork plus drifting colour fields sampled from it.
  // Everything here is rendered small and scaled up, and only transform/opacity animate.
  let { image, intense = false }: { image: string | null; intense?: boolean } = $props();
  let colors = $state<Rgb[]>([]);

  $effect(() => {
    const url = image;
    if (!url) return void (colors = []);
    let current = true;
    paletteFrom(url).then(
      (found) => current && (colors = found),
      (e) => console.warn("[ambient] palette unavailable", e),
    );
    return () => (current = false);
  });

  const rgb = (c: Rgb | undefined, alpha: number) => (c ? `rgb(${c[0]} ${c[1]} ${c[2]} / ${alpha})` : "transparent");
</script>

<div class="ambient" class:intense aria-hidden="true">
  <div class="fallback"></div>
  {#key image}
    {#if image}
      <img class="art" src={image} alt="" width="96" height="96" crossorigin="anonymous" transition:fade={{ duration: 900 }} />
    {/if}
  {/key}
  <div class="fields">
    <span class="field a" style="background: radial-gradient(closest-side, {rgb(colors[0], 0.9)}, transparent)"></span>
    <span class="field b" style="background: radial-gradient(closest-side, {rgb(colors[1], 0.8)}, transparent)"></span>
    <span class="field c" style="background: radial-gradient(closest-side, {rgb(colors[2], 0.7)}, transparent)"></span>
  </div>
  <div class="tint"></div>
  <div class="grain"></div>
</div>

<style>
  .ambient {
    position: fixed;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    pointer-events: none;
  }

  .fallback,
  .tint,
  .fields,
  .grain {
    position: absolute;
    inset: 0;
  }

  .fallback {
    background: var(--bg-ambient-fallback);
  }

  .art {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 96px;
    height: 96px;
    object-fit: cover;
    filter: blur(7px) saturate(1.8);
    opacity: 0.6;
    transform: translate(-50%, -50%) scale(18) rotate(-12deg);
  }

  .field {
    position: absolute;
    width: 64vmax;
    height: 64vmax;
    border-radius: 50%;
    opacity: 0.55;
    transition: opacity var(--dur-slow) var(--ease-out);
    will-change: transform;
  }

  .a {
    left: -18vmax;
    top: -22vmax;
    animation: drift-a 38s var(--ease-out) infinite alternate;
  }

  .b {
    right: -20vmax;
    top: 10vmax;
    animation: drift-b 46s var(--ease-out) infinite alternate;
  }

  .c {
    left: 20vmax;
    bottom: -30vmax;
    animation: drift-c 52s var(--ease-out) infinite alternate;
  }

  .intense .field {
    opacity: 0.85;
  }

  .intense .art {
    opacity: 0.85;
  }

  @keyframes drift-a {
    to {
      transform: translate3d(14vmax, 10vmax, 0) scale(1.2);
    }
  }

  @keyframes drift-b {
    to {
      transform: translate3d(-16vmax, 8vmax, 0) scale(0.85);
    }
  }

  @keyframes drift-c {
    to {
      transform: translate3d(10vmax, -14vmax, 0) scale(1.15);
    }
  }

  .tint {
    background: var(--bg-tint);
  }

  /* Film grain keeps big gradients from banding and gives the glass something to refract. */
  .grain {
    opacity: 0.05;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
  }

  :global([data-effects="balanced"]) .field {
    animation: none;
  }

  :global([data-effects="minimal"]) .fields {
    display: none;
  }
</style>
