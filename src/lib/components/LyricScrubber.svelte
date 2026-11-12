<script lang="ts">
  import { lineAt, sectionStarts } from "$lib/cinema";
  import { formatDuration } from "$lib/format";
  import type { LyricLine } from "$lib/lrc";
  import Slider from "./Slider.svelte";

  // The seek bar, aware of the lyrics: hovering or dragging shows the time and the line sung there,
  // and small ticks mark where sections start. Without synced lyrics it shows the time alone.
  let {
    position,
    durationMs,
    lines,
    shiftMs,
    onseek,
  }: {
    position: number;
    durationMs: number;
    lines: LyricLine[];
    /** The lyrics view's lead plus this song's offset, so the bubble matches what lights up. */
    shiftMs: number;
    onseek: (ms: number) => void;
  } = $props();

  let width = $state(0);
  let bubbleWidth = $state(0);
  let hoverMs = $state<number | null>(null);
  let dragMs = $state<number | null>(null);

  const ticks = $derived(durationMs > 0 ? sectionStarts(lines).map((t) => t - shiftMs).filter((t) => t > 0 && t < durationMs) : []);
  const at = $derived(dragMs ?? hoverMs);
  const line = $derived(at === null ? null : lineAt(lines, at, shiftMs));
  const x = $derived.by(() => {
    if (at === null || durationMs <= 0) return 0;
    const half = bubbleWidth / 2;
    return Math.min(Math.max(half, (at / durationMs) * width), Math.max(half, width - half));
  });

  function hover(event: PointerEvent) {
    if (durationMs <= 0) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    hoverMs = Math.min(durationMs, Math.max(0, ((event.clientX - rect.left) / rect.width) * durationMs));
  }

  function commit(ms: number) {
    dragMs = null;
    onseek(ms);
  }
</script>

<div class="scrubber" role="presentation" bind:clientWidth={width} onpointermove={hover} onpointerleave={() => (hoverMs = null)}>
  <Slider
    value={position}
    max={durationMs}
    step={1000}
    tone="accent"
    label="Seek"
    valuetext="{formatDuration(position)} of {formatDuration(durationMs)}"
    oncommit={commit}
    onpreview={(ms) => (dragMs = ms)}
  />
  <div class="ticks" aria-hidden="true">
    {#each ticks as tick, i (i)}<i style="left: {(tick / durationMs) * 100}%"></i>{/each}
  </div>
  {#if at !== null}
    <div class="bubble glass" bind:clientWidth={bubbleWidth} style="left: {x}px" aria-hidden="true">
      <span class="time tabular">{formatDuration(at)}</span>
      {#if line}<span class="line" class:quiet={!line.text}>{line.text || "Instrumental"}</span>{/if}
    </div>
  {/if}
</div>

<style>
  .scrubber {
    position: relative;
    flex: 1;
    display: flex;
    min-width: 0;
  }

  /* The thumb rides over the section ticks. */
  .scrubber :global(.thumb) {
    z-index: 1;
  }

  .ticks {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .ticks i {
    position: absolute;
    top: 50%;
    width: 2px;
    height: 8px;
    border-radius: var(--r-pill);
    background: rgb(255 255 255 / 0.55);
    box-shadow: 0 0 0 1px rgb(0 0 0 / 0.25);
    transform: translate(-50%, -50%);
  }

  .bubble {
    position: absolute;
    bottom: calc(100% + var(--sp-3));
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    max-width: min(420px, 100%);
    padding: 6px var(--sp-3);
    border-radius: var(--r-md);
    transform: translateX(-50%);
    pointer-events: none;
    white-space: nowrap;
  }

  .time {
    font-size: var(--fs-caption);
    font-weight: 700;
    color: var(--accent);
  }

  .line {
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: var(--font-lyrics);
    font-size: var(--fs-small);
    font-weight: 650;
  }

  .quiet {
    color: var(--text-muted);
    font-style: italic;
  }
</style>
