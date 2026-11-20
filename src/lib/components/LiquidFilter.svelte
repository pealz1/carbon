<script lang="ts">
  import { canBendBackdrop, pillMapUrl } from "$lib/liquid-glass";

  // The SVG filter a pill-shaped panel uses as its backdrop filter, sized to the panel. Reference it
  // as url(#id) under [data-engine="chromium"]; elsewhere nothing is drawn and the panel keeps its
  // frosted glass.
  let { id, width, height, bezel = 18, strength = 28 }: { id: string; width: number; height: number; bezel?: number; strength?: number } = $props();
  const able = typeof navigator !== "undefined" && canBendBackdrop(navigator.userAgent);
  // Rounded to 8 px so a resize doesn't redraw the map every frame.
  const w = $derived(Math.round(width / 8) * 8);
  const h = $derived(Math.round(height / 8) * 8);
  const map = $derived(able && w > 0 && h > 0 ? pillMapUrl(w, h, Math.min(bezel, h / 2)) : null);
</script>

{#if map}
  <svg class="defs" width="0" height="0" aria-hidden="true">
    <filter {id} x="0" y="0" width={w} height={h} filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feImage href={map} x="0" y="0" width={w} height={h} preserveAspectRatio="none" result="bend" />
      <feDisplacementMap in="SourceGraphic" in2="bend" scale={strength} xChannelSelector="R" yChannelSelector="G" />
    </filter>
  </svg>
{/if}

<style>
  .defs {
    position: absolute;
    width: 0;
    height: 0;
    overflow: hidden;
    pointer-events: none;
  }
</style>
