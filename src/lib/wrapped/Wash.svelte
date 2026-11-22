<script lang="ts" module>
  /** How long one slide's colours take to give way to the next (the wallpaper's own pace). */
  const FADE_MS = 1400;
</script>

<script lang="ts">
  import { fade } from "svelte/transition";

  // The story's background: two colour fields read from a slide's artwork (never the artwork
  // itself) that drift slowly and cross-fade when the colours change. Graphite without colours.
  // Only transform and opacity animate.
  let { colors, calm, still }: { colors: [string, string] | null; calm: boolean; /** Hold the drift: the window can't be seen. */ still: boolean } = $props();

  const style = $derived(colors ? `--a: ${colors[0]}; --b: ${colors[1]}` : "");
  const duration = $derived(calm ? 0 : FADE_MS);
</script>

<div class="wash" class:still aria-hidden="true">
  {#key style}
    <div class="fields" {style} in:fade={{ duration }} out:fade={{ duration }}>
      <span class="field a"></span>
      <span class="field b"></span>
    </div>
  {/key}
  <div class="grain"></div>
</div>

<style>
  .wash,
  .fields,
  .grain {
    position: absolute;
    inset: 0;
  }

  .wash {
    overflow: hidden;
    pointer-events: none;
  }

  .fields {
    --a: var(--graphite-700);
    --b: var(--graphite-800);
  }

  /* Drawn at half size and scaled up, as the wallpaper does: a soft gradient loses nothing. */
  .field {
    position: absolute;
    width: 60vmax;
    height: 60vmax;
    border-radius: 50%;
    transform: scale(2);
    will-change: transform;
  }

  .a {
    left: -12vmax;
    top: -22vmax;
    background: radial-gradient(closest-side, var(--a), transparent);
    animation: drift-a 38s ease-in-out infinite alternate;
  }

  .b {
    right: -14vmax;
    bottom: -26vmax;
    background: radial-gradient(closest-side, var(--b), transparent);
    animation: drift-b 46s ease-in-out infinite alternate;
  }

  @keyframes drift-a {
    to {
      transform: translate3d(22vmax, 12vmax, 0) scale(2.3);
    }
  }

  @keyframes drift-b {
    to {
      transform: translate3d(-24vmax, -10vmax, 0) scale(1.8);
    }
  }

  .still .field {
    animation-play-state: paused;
  }

  .grain {
    background-image: var(--grain);
  }

  /* Balanced keeps the colour and holds still, like the wallpaper. Minimal stops it app-wide. */
  :global([data-effects="balanced"]) .field {
    animation: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .field {
      animation: none;
    }
  }
</style>
