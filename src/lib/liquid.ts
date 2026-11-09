// Svelte action: a specular highlight that follows the pointer across a .liquid surface.
// Writes two CSS variables once per animation frame; the highlight moves via transform only.
export function specular(node: HTMLElement) {
  let frame = 0;
  let x = 0;
  let y = 0;

  const paint = () => {
    frame = 0;
    node.style.setProperty("--mx", `${x}px`);
    node.style.setProperty("--my", `${y}px`);
  };

  const move = (event: PointerEvent) => {
    const rect = node.getBoundingClientRect();
    x = event.clientX - rect.left;
    y = event.clientY - rect.top;
    node.style.setProperty("--spec", "1");
    frame ||= requestAnimationFrame(paint);
  };

  const leave = () => node.style.setProperty("--spec", "0");

  node.addEventListener("pointermove", move, { passive: true });
  node.addEventListener("pointerleave", leave);
  return {
    destroy() {
      cancelAnimationFrame(frame);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerleave", leave);
    },
  };
}
