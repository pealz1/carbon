<script lang="ts">
  // Wraps the player bar's progress bar: shows the A-B loop on it, and its right-click menu sets the
  // loop's ends at the time under the pointer.
  import type { Snippet } from "svelte";
  import { abLoop } from "$lib/ab-loop.svelte";
  import { formatDuration } from "$lib/format";
  import { menu } from "$lib/menu.svelte";

  let { max, children }: { max: number; children: Snippet } = $props();

  const at = (ms: number | null) => (ms === null || max <= 0 ? null : Math.min(1, Math.max(0, ms / max)));
  const a = $derived(at(abLoop.a));
  const b = $derived(at(abLoop.b));

  function openMenu(event: MouseEvent) {
    if (max <= 0) return;
    event.preventDefault();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const ms = Math.round(((event.clientX - rect.left) / rect.width) * max);
    const time = formatDuration(ms);
    menu.openAt(event.clientX, event.clientY, [
      { label: `Loop from ${time}`, icon: "repeat", action: () => abLoop.set("a", ms) },
      { label: `Loop until ${time}`, icon: "repeat", action: () => abLoop.set("b", ms) },
      { label: "Stop looping", icon: "close", disabled: abLoop.a === null, action: abLoop.clear },
    ]);
  }
</script>

<div class="zone" oncontextmenu={openMenu} role="presentation">
  {@render children()}
  {#if a !== null}
    <span class="span" class:open={b === null} style="--a: {a}; --b: {b ?? a}" aria-hidden="true"></span>
    <span class="mark" style="--at: {a}" aria-hidden="true">A</span>
  {/if}
  {#if b !== null}<span class="mark" style="--at: {b}" aria-hidden="true">B</span>{/if}
</div>

<style>
  .zone {
    position: relative;
    display: flex;
    flex: 1;
    align-items: center;
  }

  /* The looped stretch, a soft band over the track. */
  .span {
    position: absolute;
    left: calc(var(--a) * 100%);
    top: 50%;
    width: calc((var(--b) - var(--a)) * 100%);
    height: 8px;
    border-radius: var(--r-pill);
    background: var(--accent-glow);
    transform: translateY(-50%);
    pointer-events: none;
  }

  .span.open {
    display: none;
  }

  .mark {
    position: absolute;
    left: calc(var(--at) * 100%);
    bottom: calc(50% + 6px);
    font-size: 9px;
    font-weight: 800;
    line-height: 1;
    color: var(--accent);
    transform: translateX(-50%);
    pointer-events: none;
  }
</style>
