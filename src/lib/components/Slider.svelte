<script lang="ts">
  // Accessible range input with a glass track. The fill animates via transform only.
  let {
    value,
    max,
    label,
    step = 1,
    oncommit,
    onpreview,
  }: {
    value: number;
    max: number;
    label: string;
    step?: number;
    oncommit: (value: number) => void;
    onpreview?: (value: number) => void;
  } = $props();

  let dragging = $state(false);
  let dragValue = $state(0);
  const shown = $derived(dragging ? dragValue : value);
  const ratio = $derived(max > 0 ? Math.min(1, Math.max(0, shown / max)) : 0);

  function onInput(event: Event) {
    dragging = true;
    dragValue = Number((event.currentTarget as HTMLInputElement).value);
    onpreview?.(dragValue);
  }

  function onChange(event: Event) {
    const next = Number((event.currentTarget as HTMLInputElement).value);
    dragging = false;
    oncommit(next);
  }
</script>

<div class="slider" class:dragging style="--ratio: {ratio}">
  <div class="track"><div class="fill"></div></div>
  <div class="thumb"></div>
  <input type="range" min="0" {max} {step} value={shown} aria-label={label} oninput={onInput} onchange={onChange} />
</div>

<style>
  .slider {
    position: relative;
    height: 18px;
    display: flex;
    align-items: center;
    flex: 1;
  }

  .track {
    position: relative;
    height: 4px;
    width: 100%;
    border-radius: var(--r-pill);
    background: rgb(255 255 255 / 0.14);
    overflow: hidden;
  }

  .fill {
    position: absolute;
    inset: 0;
    background: var(--text);
    transform-origin: left center;
    transform: scaleX(var(--ratio));
  }

  .thumb {
    position: absolute;
    left: calc(var(--ratio) * 100%);
    width: 12px;
    height: 12px;
    margin-left: -6px;
    border-radius: var(--r-pill);
    background: var(--text);
    box-shadow: 0 0 0 4px var(--accent-glow);
    opacity: 0;
    transform: scale(0.6);
    transition: opacity var(--dur-fast), transform var(--dur-fast) var(--ease-spring);
    pointer-events: none;
  }

  .slider:hover .fill,
  .dragging .fill {
    background: var(--accent);
  }

  .slider:hover .thumb,
  .dragging .thumb,
  .slider:focus-within .thumb {
    opacity: 1;
    transform: scale(1);
  }

  input {
    position: absolute;
    inset: 0;
    width: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  .slider:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 4px;
    border-radius: var(--r-pill);
  }
</style>
