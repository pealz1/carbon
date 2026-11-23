/* Toasts: short, glass, bottom-centre. Messages are set as text, never as markup. */
import { el, icon } from "./icons.js?v=1";

const MAX = 3;
const TONE_ICON = { ok: "check", err: "alert", info: "info" };
let region;

function host() {
  if (region?.isConnected) return region;
  region = el("div", "toasts");
  region.setAttribute("aria-live", "polite");
  document.body.append(region);
  return region;
}

function dismiss(node) {
  if (!node.isConnected || node.classList.contains("is-leaving")) return;
  node.classList.add("is-leaving");
  node.addEventListener("animationend", () => node.remove(), { once: true });
  setTimeout(() => node.remove(), 400);
}

/** Shows a toast. tone: "ok" | "err" | "info". Errors are announced assertively and stay longer. */
export function toast(message, { tone = "info", timeout = 3800 } = {}) {
  const box = host();
  const node = el("div", `toast toast--${tone}`);
  if (tone === "err") node.setAttribute("role", "alert");
  const dot = el("span", "toast__dot");
  dot.append(icon(TONE_ICON[tone] ?? "info"));
  node.append(dot, el("span", "", message));
  box.append(node);
  while (box.children.length > MAX) box.firstElementChild.remove();
  setTimeout(() => dismiss(node), tone === "err" ? timeout + 2200 : timeout);
  node.addEventListener("click", () => dismiss(node));
  return node;
}
