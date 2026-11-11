<script lang="ts">
  // Accessible range input on a thin track. The fill moves via transform only; the thumb shows
  // on hover, drag and focus. `accent` fills with the accent (playback progress), `paper` with white.
  let {
    value,
    max,
    label,
    step = 1,
    tone = "paper",
    valuetext,
    oncommit,
    onpreview,
  }: {
    value: number;
    max: number;
    label: string;
    step?: number;
    tone?: "accent" | "paper";
    valuetext?: string;
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

<div class="slider {tone}" class:dragging style="--ratio: {ratio}" data-silent>
  <div class="track"><div class="fill"></div></div>
  <div class="thumb"></div>
  <input type="range" min="0" {max} {step} value={shown} aria-label={label} aria-valuetext={valuetext} oninput={onInput} onchange={onChange} />
</div>

<style>
  .slider {
    --fill: var(--paper);
    position: relative;
    height: 20px;
    display: flex;
    align-items: center;
    flex: 1;
  }

  .accent {
    --fill: var(--accent);
  }

  .track {
    position: relative;
    height: 4px;
    width: 100%;
    border-radius: var(--r-pill);
    background: rgb(255 255 255 / 0.16);
    overflow: hidden;
    transition: transform var(--dur-fast) var(--ease-out);
  }

  .slider:hover .track,
  .dragging .track {
    transform: scaleY(1.5);
  }

  .fill {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: var(--fill);
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
    background: var(--paper);
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.5);
    opacity: 0;
    transform: scale(0.5);
    transition:
      opacity var(--dur-fast),
      transform var(--dur-med) var(--ease-spring);
    pointer-events: none;
  }

  .slider:hover .thumb,
  .dragging .thumb,
  .slider:focus-within .thumb {
    opacity: 1;
    transform: scale(1);
  }

  .dragging .thumb {
    transform: scale(1.2);
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
    outline-offset: 3px;
    border-radius: var(--r-pill);
  }
</style>
