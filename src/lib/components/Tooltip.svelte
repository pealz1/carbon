<script lang="ts">
  // One tooltip for the whole app. It takes over native `title` tooltips (moving the text to
  // data-tip so Windows doesn't draw its own) and shows after a short rest, on hover or keyboard focus.
  import { nudge } from "$lib/keep-in-view";

  const DELAY_MS = 400;
  const EDGE = 12;
  const GAP = 8;
  /** x is the owner's centre; y its near edge. The tip is centred on x once its width is known. */
  let tip = $state<{ text: string; x: number; y: number; below: boolean } | null>(null);
  let box = $state<HTMLElement>();
  let at = $state<{ left: number; top: number } | null>(null);

  // Measured after it renders, then kept inside the window: a tip near an edge slides in, never clips.
  $effect(() => {
    if (!tip || !box) return void (at = null);
    const left = tip.x - box.offsetWidth / 2;
    const top = tip.below ? tip.y + GAP : tip.y - GAP - box.offsetHeight;
    at = { left: left + nudge(left, box.offsetWidth, innerWidth, EDGE), top: top + nudge(top, box.offsetHeight, innerHeight, EDGE) };
  });
  let owner: HTMLElement | null = null;
  let timer = 0;

  function adopt(el: HTMLElement): string | null {
    const title = el.getAttribute("title");
    if (title) {
      el.dataset.tip = title;
      el.removeAttribute("title");
    }
    return el.dataset.tip || null;
  }

  function place(el: HTMLElement, text: string) {
    const rect = el.getBoundingClientRect();
    const below = rect.top < 64;
    tip = { text, x: rect.left + rect.width / 2, y: below ? rect.bottom : rect.top, below };
  }

  function arm(target: EventTarget | null) {
    const el = target instanceof Element ? target.closest<HTMLElement>("[title], [data-tip]") : null;
    if (el === owner) return;
    hide();
    const text = el && adopt(el);
    if (!el || !text) return;
    owner = el;
    timer = window.setTimeout(() => owner === el && place(el, text), DELAY_MS);
  }

  function hide() {
    clearTimeout(timer);
    owner = null;
    tip = null;
  }

  const leave = (event: PointerEvent) => owner && !owner.contains(event.relatedTarget as Node | null) && hide();
  const focus = (event: FocusEvent) => (event.target as Element | null)?.matches?.(":focus-visible") && arm(event.target);
</script>

<svelte:document
  onpointerover={(e) => arm(e.target)}
  onpointerout={leave}
  onpointerdown={hide}
  onfocusin={focus}
  onfocusout={hide}
  onkeydown={(e) => e.key === "Escape" && hide()}
  onscrollcapture={hide}
/>

{#if tip}
  <div bind:this={box} class="tooltip glass" class:placed={!!at} role="tooltip" style="left: {at?.left ?? 0}px; top: {at?.top ?? 0}px">{tip.text}</div>
{/if}

<style>
  .tooltip {
    position: fixed;
    z-index: 90;
    max-width: 280px;
    padding: 5px 10px;
    border-radius: var(--r-sm);
    color: var(--text);
    font-size: var(--fs-caption);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
    visibility: hidden;
  }

  .tooltip.placed {
    visibility: visible;
    animation: tip-in var(--dur-fast) var(--ease-out);
  }

  @keyframes tip-in {
    from {
      opacity: 0;
      transform: scale(0.96);
    }
  }
</style>
