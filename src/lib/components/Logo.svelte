<script lang="ts">
  // Carbon mark: a carbon ring opened into a C (brand/carbon-mark.svg). Always Carbon Yellow, whatever the accent.
  let { size = 28 }: { size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 1024 1024" aria-hidden="true">
  <path
    d="M512 0 955.41 256 955.41 384 733.7 384 512 256 290.3 384 290.3 640 512 768 733.7 640 955.41 640 955.41 768 512 1024 68.59 768 68.59 256Z"
  />
</svg>

<style>
  path {
    fill: var(--brand-yellow);
  }
</style>
