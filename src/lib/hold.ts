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

/** Adds listeners and returns one function that removes them all. */
function listen(target: EventTarget, handlers: [string, EventListener, AddEventListenerOptions?][]): () => void {
  for (const [type, handler, options] of handlers) target.addEventListener(type, handler, options);
  return () => {
    for (const [type, handler, options] of handlers) target.removeEventListener(type, handler, options);
  };
}

function swallowNextClick(node: HTMLElement): void {
  const swallow = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  node.addEventListener("click", swallow, { capture: true, once: true });
  setTimeout(() => node.removeEventListener("click", swallow, { capture: true }), 0);
}

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
      return current.onhold(at, node);
    }
    paint(timer.progress(now));
    if (timer.holding) frame = requestAnimationFrame(loop);
  };

  const stop = () => {
    cancelAnimationFrame(frame);
    paint(null);
    if (timer.end()) swallowNextClick(node);
  };

  const down = (event: PointerEvent) => {
    if (event.button !== 0 || (event.target as Element).closest("input, textarea, select")) return;
    at = { x: event.clientX, y: event.clientY };
    timer.begin(performance.now(), event.clientX, event.clientY);
    frame = requestAnimationFrame(loop);
  };

  const move = (event: PointerEvent) => timer.holding && !timer.move(event.clientX, event.clientY) && stop();

  node.classList.add("holdable");
  const unlisten = [
    listen(node, [["pointerdown", down as EventListener], ["pointermove", move as EventListener, { passive: true }], ...CANCELLERS.map((type): [string, EventListener] => [type, stop])]),
    listen(document, [["scroll", () => timer.holding && stop(), { capture: true, passive: true }]]),
  ];

  const destroy = () => {
    cancelAnimationFrame(frame);
    unlisten.forEach((off) => off());
  };
  return { update: (next: HoldOptions) => void (current = next), destroy };
}
