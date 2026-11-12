<script lang="ts">
  import type { Snippet } from "svelte";

  // A small glass panel floating above its button. A click pins it open; `peek` also opens it while
  // the pointer rests on it. Esc (which then doesn't leave cinema), a click elsewhere or the button
  // again close it. It only fades and rises, so reduced motion and Minimal effects cut the motion.
  let {
    label,
    open = $bindable(false),
    peek = false,
    align = "end",
    trigger = "ctl",
    button,
    children,
  }: {
    label: string;
    open?: boolean;
    peek?: boolean;
    align?: "start" | "end";
    /** Class for the button, so it matches the controls around it. */
    trigger?: string;
    button: Snippet;
    children: Snippet;
  } = $props();

  /** Lets the pointer cross the gap between the button and the panel. */
  const PEEK_GRACE_MS = 220;
  let pinned = $state(false);
  let hovering = $state(false);
  let root = $state<HTMLElement>();
  let toggle = $state<HTMLButtonElement>();
  let grace = 0;

  $effect(() => {
    open = pinned || (peek && hovering);
  });

  function enter() {
    clearTimeout(grace);
    hovering = true;
  }

  function leave() {
    clearTimeout(grace);
    grace = window.setTimeout(() => (hovering = false), PEEK_GRACE_MS);
  }

  function close(event: Event, refocus: boolean) {
    pinned = false;
    hovering = false;
    if (!refocus) return;
    event.preventDefault();
    toggle?.focus();
  }

  const outside = (event: PointerEvent) => open && !root?.contains(event.target as Node) && close(event, false);
  const escape = (event: KeyboardEvent) => open && event.key === "Escape" && close(event, true);
</script>

<svelte:document onpointerdown={outside} onkeydown={escape} />

<div class="popover" role="presentation" bind:this={root} onpointerenter={enter} onpointerleave={leave}>
  <button bind:this={toggle} class={trigger} class:open aria-expanded={open} aria-haspopup="dialog" aria-label={label} title={peek ? undefined : label} onclick={() => (pinned = !pinned)}>
    {@render button()}
  </button>
  {#if open}
    <div class="panel glass {align}" role="dialog" aria-label={label}>
      {@render children()}
    </div>
  {/if}
</div>

<style>
  .popover {
    position: relative;
    display: flex;
  }

  .panel {
    position: absolute;
    /* --lift: how far above this button the bar's top edge is, so the panel clears the whole bar. */
    bottom: calc(100% + var(--lift, 0px) + var(--sp-3));
    z-index: 2;
    min-width: 240px;
    padding: var(--sp-3);
    border-radius: var(--r-lg);
    transform-origin: bottom right;
    animation: rise var(--dur-fast) var(--ease-out);
  }

  .end {
    right: 0;
  }

  .start {
    left: 0;
    transform-origin: bottom left;
  }

  /* Bridges the gap above the button, so moving onto the panel doesn't close a peek. */
  .panel::after {
    content: "";
    position: absolute;
    inset: 100% 0 calc(-1 * (var(--lift, 0px) + var(--sp-3)));
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(6px) scale(0.98);
    }
  }
</style>
