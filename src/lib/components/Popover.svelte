<script lang="ts">
  // A glass panel anchored to a toolbar button (devices, sleep timer). Closes on Esc, a click
  // elsewhere or leaving the window, and hands focus back to its button.
  import type { Snippet } from "svelte";
  import { fly } from "svelte/transition";
  import { keepInView } from "$lib/keep-in-view";

  let { anchor, label, onclose, children }: { anchor: HTMLElement; label: string; onclose: () => void; children: Snippet } = $props();

  const GAP = 10;
  const MARGIN = 8;
  let panel = $state<HTMLElement>();
  let place = $state({ right: MARGIN, vertical: 0, below: false });

  $effect(() => {
    const rect = anchor.getBoundingClientRect();
    const below = innerHeight - rect.bottom > rect.top;
    place = {
      right: Math.max(MARGIN, innerWidth - rect.right - MARGIN),
      vertical: below ? rect.bottom + GAP : innerHeight - rect.top + GAP,
      below,
    };
    panel?.querySelector<HTMLElement>("button:not(:disabled), input")?.focus();
    return () => anchor.focus();
  });

  const outside = (event: Event) => !panel?.contains(event.target as Node) && !anchor.contains(event.target as Node);
</script>

<!-- Esc is caught on the document, before the window's shortcuts, so in cinema it closes only this. -->
<svelte:document onkeydown={(e) => e.key === "Escape" && (e.preventDefault(), onclose())} />
<svelte:window onpointerdown={(e) => outside(e) && onclose()} onresize={onclose} onblur={onclose} />

<div
  bind:this={panel}
  class="popover glass"
  role="dialog"
  aria-label={label}
  style:right="{place.right}px"
  style:top={place.below ? `${place.vertical}px` : undefined}
  style:bottom={place.below ? undefined : `${place.vertical}px`}
  use:keepInView
  transition:fly={{ y: place.below ? -8 : 8, duration: 200 }}
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
