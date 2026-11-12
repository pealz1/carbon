<script lang="ts">
  import type { Snippet } from "svelte";

  // Cinema bar's popover: a button and a glass panel above it. Unlike Popover (the player bar's
  // dialogs), it can open on hover (`peek`), it lifts clear of the whole bar (CSS `--lift`), and its
  // panel stays inside the bar, so hovering it counts as using the bar. A click pins it open; Esc
  // (without leaving cinema), a click elsewhere or the button again close it.
  let {
    label,
    peek = false,
    trigger = "ctl",
    button,
    children,
  }: {
    label: string;
    peek?: boolean;
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
  const open = $derived(pinned || (peek && hovering));

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
    <div class="panel glass" role="dialog" aria-label={label}>
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
    right: 0;
    bottom: calc(100% + var(--lift, 0px) + var(--sp-3));
    z-index: 2;
    min-width: 240px;
    padding: var(--sp-3);
    border-radius: var(--r-lg);
    color: var(--text);
    transform-origin: bottom right;
    animation: rise var(--dur-fast) var(--ease-out);
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
