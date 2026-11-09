<script lang="ts">
  // Carbon mark: an open hexagon (a carbon ring) that reads as the letter C, in liquid glass.
  let { size = 28 }: { size?: number } = $props();
  const uid = $props.id();
</script>

<svg width={size} height={size} viewBox="200 180 624 664" aria-hidden="true">
  <defs>
    <linearGradient id="{uid}-liquid" x1="0.15" y1="0.05" x2="0.85" y2="0.95">
      <stop offset="0" stop-color="#7FE7FF" />
      <stop offset="0.45" stop-color="#A99CFF" />
      <stop offset="1" stop-color="#FF8AD4" />
    </linearGradient>
    <linearGradient id="{uid}-sheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.85" />
      <stop offset="0.5" stop-color="#fff" stop-opacity="0" />
    </linearGradient>
  </defs>
  <path
    d="M740.4 380 L512 248 L283.6 380 L283.6 644 L512 776 L740.4 644"
    fill="none"
    stroke="url(#{uid}-liquid)"
    stroke-width="112"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  <path d="M722 362 L512 240 L302 362 L302 520" fill="none" stroke="url(#{uid}-sheen)" stroke-width="22" stroke-linecap="round" stroke-linejoin="round" />
  <circle cx="512" cy="512" r="66" fill="#F4F2FF" />
</svg>
