// Hands over from the loading screen in app.html (it paints before any script) to the app.
const FALLBACK_MS = 700;

export function dismissBootScreen(doc: Document = document): void {
  const screen = doc.getElementById("boot-screen");
  if (!screen || screen.classList.contains("done")) return;
  const remove = () => screen.remove();
  screen.classList.add("done");
  screen.addEventListener("transitionend", remove, { once: true });
  setTimeout(remove, FALLBACK_MS); // no transition (minimal effects, reduced motion) means no transitionend
}
