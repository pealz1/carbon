<script lang="ts">
  // One tooltip for the whole app. It takes over native `title` tooltips (moving the text to
  // data-tip so Windows doesn't draw its own) and shows after a short rest, on hover or keyboard focus.
  const DELAY_MS = 400;
  const EDGE = 12;
  let tip = $state<{ text: string; x: number; y: number; below: boolean } | null>(null);
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
    const x = Math.min(innerWidth - EDGE, Math.max(EDGE, rect.left + rect.width / 2));
    tip = { text, x, y: below ? rect.bottom + 8 : rect.top - 8, below };
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
  <div class="tooltip glass" class:below={tip.below} role="tooltip" style="left: {tip.x}px; top: {tip.y}px">{tip.text}</div>
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
    transform: translate(-50%, -100%);
    animation: tip-in var(--dur-fast) var(--ease-out);
  }

  .tooltip.below {
    transform: translate(-50%, 0);
  }

  @keyframes tip-in {
    from {
      opacity: 0;
    }
  }
</style>
