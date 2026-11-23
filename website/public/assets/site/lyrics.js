/*
  The home page's lyrics demo: a made-up song whose words fill as they're "sung", like Carbon's
  lyrics view. Every word is one Web Animation on clip-path, so pausing and seeking are exact.
  It plays only while on screen, never on its own with reduced motion, and loops.
*/
import { el } from "./icons.js?v=1";

// Original lyrics written for this page, with a Spanish translation for the translation toggle.
const SONG = [
  ["the radio hums in another room", "la radio zumba en otro cuarto"],
  ["and every light on the street", "y cada luz de la calle"],
  ["turns gold when you sing", "se vuelve oro cuando cantas"],
  ["so I leave the window open", "así que dejo la ventana abierta"],
  ["let the city carry the tune", "que la ciudad lleve la melodía"],
  ["we were glass, we were glass", "éramos cristal, éramos cristal"],
  ["and the morning comes through", "y la mañana nos atraviesa"],
];
const INTRO_MS = 1200;
const LINE_MS = 3200;
const GAP_MS = 600;
const OUTRO_MS = 1800;
const TOTAL_MS = INTRO_MS + SONG.length * (LINE_MS + GAP_MS) + OUTRO_MS;

const clock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Word start times and lengths inside a line, weighted by word length like a sung phrase. */
function timeWords(words, lineStart) {
  const weights = words.map((w) => w.length + 2);
  const sum = weights.reduce((a, b) => a + b, 0);
  let at = lineStart;
  return words.map((word, i) => {
    const duration = (weights[i] / sum) * LINE_MS;
    const timing = { word, start: at, duration };
    at += duration;
    return timing;
  });
}

function buildLine(text, translation, start) {
  const li = el("li");
  const button = el("button", "lyric");
  button.type = "button";
  button.dataset.start = String(start);
  const anims = [];
  timeWords(text.split(" "), start).forEach(({ word, start: at, duration }, i, all) => {
    const shown = i < all.length - 1 ? `${word} ` : word;
    const span = el("span", "w", shown);
    const fill = el("span", "w__fill", shown);
    fill.setAttribute("aria-hidden", "true");
    span.append(fill);
    button.append(span);
    anims.push(
      fill.animate([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)" }], {
        delay: at,
        duration,
        fill: "both",
        easing: "linear",
      }),
    );
  });
  button.append(el("span", "lyric__tr", translation));
  li.append(button);
  return { li, button, start, end: start + LINE_MS, anims };
}

export function initLyrics() {
  const root = document.querySelector("[data-lyrics-demo]");
  if (!root || typeof Element.prototype.animate !== "function") return;
  const list = root.querySelector("[data-lyrics-lines]");
  const viewport = root.querySelector("[data-lyrics-viewport]");
  const toggle = root.querySelector("[data-lyrics-toggle]");
  const nowText = root.querySelector("[data-lyrics-now]");
  const bar = root.querySelector("[data-lyrics-bar]");
  root.querySelector("[data-lyrics-total]").textContent = clock(TOTAL_MS);

  const lines = SONG.map(([text, tr], i) => buildLine(text, tr, INTRO_MS + i * (LINE_MS + GAP_MS)));
  list.replaceChildren(...lines.map((l) => l.li));
  const master = bar.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: TOTAL_MS, fill: "both" });
  const all = [master, ...lines.flatMap((l) => l.anims)];

  let current = -1;
  let userPaused = false;
  let visible = false;

  const seek = (ms) => all.forEach((a) => { a.currentTime = ms; });
  const playing = () => master.playState === "running";
  const setPlaying = (on) => {
    all.forEach((a) => (on ? a.play() : a.pause()));
    toggle.setAttribute("aria-pressed", String(on));
    toggle.setAttribute("aria-label", on ? "Pause the demo" : "Play the demo");
  };

  function centre(index) {
    const line = lines[Math.max(0, index)].button;
    const offset = line.offsetTop + line.offsetHeight / 2 - viewport.clientHeight / 2;
    list.style.setProperty("transform", `translateY(${-Math.max(0, offset)}px)`);
  }

  function update() {
    const t = master.currentTime ?? 0;
    if (t >= TOTAL_MS && playing()) {
      seek(0);
      current = -1;
    }
    nowText.textContent = clock(t);
    let index = lines.findIndex((l) => t >= l.start && t < l.end + GAP_MS);
    if (index === -1) index = t < INTRO_MS ? -1 : lines.length - 1;
    if (index !== current) {
      current = index;
      lines.forEach((l, i) => {
        l.button.classList.toggle("is-now", i === index);
        l.button.classList.toggle("is-past", i < index);
      });
      centre(index);
    }
    if (visible) requestAnimationFrame(update);
  }

  toggle.addEventListener("click", () => {
    userPaused = playing();
    setPlaying(!userPaused);
    if (!userPaused) requestAnimationFrame(update);
  });
  list.addEventListener("click", (event) => {
    const line = event.target.closest(".lyric");
    if (!line) return;
    seek(Number(line.dataset.start));
    current = -1;
    update();
  });
  root.querySelector("[data-lyrics-translate]")?.addEventListener("change", (event) => {
    root.classList.toggle("is-translated", event.target.checked);
    current = -1;
    requestAnimationFrame(update);
  });

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  setPlaying(false);
  // With reduced motion the demo rests on a line mid-fill and waits for a press of play.
  seek(reduced ? INTRO_MS + LINE_MS + GAP_MS + LINE_MS * 0.55 : 0);
  if (reduced) userPaused = true;
  update();

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && !userPaused) setPlaying(true);
    if (!visible && playing()) setPlaying(false);
    if (visible) requestAnimationFrame(update);
  }, { threshold: 0.35 }).observe(root);
}
