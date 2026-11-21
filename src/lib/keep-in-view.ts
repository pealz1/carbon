// Floating panels (menus, popovers, tooltips) can never hang off the window: whatever put them
// where they are, this pushes them back inside, again whenever they or the window change size.

const MARGIN = 8;

/** How far a box must move along one axis to sit inside 0..limit with a margin. Too big to fit: pin its start. */
export function nudge(start: number, size: number, limit: number, margin = MARGIN): number {
  if (size + 2 * margin >= limit) return margin - start;
  if (start < margin) return margin - start;
  const over = start + size - (limit - margin);
  return over > 0 ? -over : 0;
}

/**
 * A Svelte action for `position: fixed` panels. It reads layout boxes, not painted ones, so an
 * opening animation that scales the panel can't fool it, and moves the panel with `translate`,
 * which composes with whatever `transform` the panel animates.
 */
export function keepInView(node: HTMLElement) {
  const place = () => {
    const dx = nudge(node.offsetLeft, node.offsetWidth, innerWidth);
    const dy = nudge(node.offsetTop, node.offsetHeight, innerHeight);
    node.style.translate = dx || dy ? `${dx}px ${dy}px` : "";
  };
  const sizes = new ResizeObserver(place);
  sizes.observe(node);
  addEventListener("resize", place);
  place();
  return {
    update: place,
    destroy() {
      sizes.disconnect();
      removeEventListener("resize", place);
    },
  };
}
