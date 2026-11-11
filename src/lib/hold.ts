// Svelte action: press and hold an element to open its menu. The fill shows progress (CSS reads
// --hold from 0 to 1 on .holdable); on completion the hold sound plays and the release's click is
// swallowed so the row doesn't also play. Right-click, the "…" button and the menu key reach the
// same menu, so holding is never the only way in.
import { HOLD_SHOW_AFTER, HoldTimer } from "$lib/hold-timer";
import { playSound } from "$lib/sfx";

export interface HoldOptions {
  onhold: (at: { x: number; y: number }, node: HTMLElement) => void;
}

const CANCELLERS = ["pointerup", "pointercancel", "pointerleave", "dragstart", "contextmenu"] as const;

export function hold(node: HTMLElement, options: HoldOptions) {
  let current = options;
  const timer = new HoldTimer();
  let frame = 0;
  let at = { x: 0, y: 0 };

  const paint = (progress: number | null) => {
    node.style.setProperty("--hold", String(progress ?? 0));
    node.toggleAttribute("data-holding", progress !== null && progress >= HOLD_SHOW_AFTER);
  };

  const loop = () => {
    const now = performance.now();
    if (timer.tick(now)) {
      paint(null);
      playSound("hold");
      current.onhold(at, node);
      return;
    }
    paint(timer.progress(now));
    if (timer.holding) frame = requestAnimationFrame(loop);
  };

  const swallowClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const stop = () => {
    cancelAnimationFrame(frame);
    paint(null);
    if (!timer.end()) return;
    node.addEventListener("click", swallowClick, { capture: true, once: true });
    setTimeout(() => node.removeEventListener("click", swallowClick, { capture: true }), 0);
  };

  const down = (event: PointerEvent) => {
    if (event.button !== 0 || (event.target as Element).closest("input, textarea, select")) return;
    at = { x: event.clientX, y: event.clientY };
    timer.begin(performance.now(), event.clientX, event.clientY);
    frame = requestAnimationFrame(loop);
  };

  const move = (event: PointerEvent) => {
    if (timer.holding && !timer.move(event.clientX, event.clientY)) stop();
  };

  const scrolled = () => timer.holding && stop();

  node.classList.add("holdable");
  node.addEventListener("pointerdown", down);
  node.addEventListener("pointermove", move, { passive: true });
  for (const type of CANCELLERS) node.addEventListener(type, stop);
  document.addEventListener("scroll", scrolled, { capture: true, passive: true });

  return {
    update(next: HoldOptions) {
      current = next;
    },
    destroy() {
      cancelAnimationFrame(frame);
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointermove", move);
      for (const type of CANCELLERS) node.removeEventListener(type, stop);
      document.removeEventListener("scroll", scrolled, { capture: true });
    },
  };
}
