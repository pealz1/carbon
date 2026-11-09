<!-- Refraction used by .liquid surfaces on the Full effects level: a low-frequency noise field
     displaces what's behind the glass, so the backdrop bends like it's seen through liquid. -->
<svg class="defs" aria-hidden="true" focusable="false">
  <filter id="carbon-refract" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.0045 0.007" numOctaves="2" seed="11" result="noise" />
    <feGaussianBlur in="noise" stdDeviation="3" result="smooth" />
    <feDisplacementMap in="SourceGraphic" in2="smooth" scale="34" xChannelSelector="R" yChannelSelector="G" />
  </filter>
</svg>

<style>
  .defs {
    position: absolute;
    width: 0;
    height: 0;
    overflow: hidden;
  }
</style>
