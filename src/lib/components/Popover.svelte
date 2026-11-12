<script lang="ts">
  // A glass panel floating above a player-bar button (devices, sleep timer). Closes on Esc, a click
  // elsewhere or leaving the window, and hands focus back to its button.
  import type { Snippet } from "svelte";
  import { fly } from "svelte/transition";

  let { anchor, label, onclose, children }: { anchor: HTMLElement; label: string; onclose: () => void; children: Snippet } = $props();

  const GAP = 10;
  const MARGIN = 8;
  let panel = $state<HTMLElement>();
  let place = $state({ right: MARGIN, bottom: 0 });

  $effect(() => {
    const rect = anchor.getBoundingClientRect();
    place = { right: Math.max(MARGIN, innerWidth - rect.right - MARGIN), bottom: innerHeight - rect.top + GAP };
    panel?.querySelector<HTMLElement>("button:not(:disabled), input")?.focus();
    return () => anchor.focus();
  });

  const outside = (event: Event) => !panel?.contains(event.target as Node) && !anchor.contains(event.target as Node);
</script>

<svelte:window
  onpointerdown={(e) => outside(e) && onclose()}
  onkeydown={(e) => e.key === "Escape" && (e.preventDefault(), onclose())}
  onresize={onclose}
  onblur={onclose}
/>

<div
  bind:this={panel}
  class="popover glass"
  role="dialog"
  aria-label={label}
  style="right: {place.right}px; bottom: {place.bottom}px"
  transition:fly={{ y: 8, duration: 200 }}
>
  {@render children()}
</div>

<style>
  .popover {
    position: fixed;
    z-index: 40;
    width: 320px;
    max-height: min(480px, calc(100vh - 140px));
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-4);
    border-radius: var(--r-lg);
    color: var(--text);
  }
</style>
