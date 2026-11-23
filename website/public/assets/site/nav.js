/*
  Header: glass once the page scrolls, the phone menu, and account state. Pages ship signed-out
  buttons; the avatar (and the admin link for admins) replaces them only when GET /v1/me answers.
  It asks only if this browser has signed in before, so first-time visitors make no credentialed
  cross-origin request. Any failure leaves the signed-out buttons.
*/
import { API_BASE, sessionHint } from "../auth/api.js?v=4";

const TIMEOUT_MS = 3000;

function watchScroll(header) {
  const sentinel = document.createElement("div");
  sentinel.setAttribute("aria-hidden", "true");
  sentinel.style.setProperty("position", "absolute");
  sentinel.style.setProperty("top", "0");
  sentinel.style.setProperty("height", "8px");
  document.body.prepend(sentinel);
  new IntersectionObserver(([entry]) => header.classList.toggle("is-scrolled", !entry.isIntersecting)).observe(sentinel);
}

function phoneMenu(header) {
  const toggle = header.querySelector(".nav-toggle");
  const nav = header.querySelector(".nav");
  if (!toggle || !nav) return;
  const set = (open) => {
    header.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  };
  toggle.addEventListener("click", () => set(!header.classList.contains("is-open")));
  nav.addEventListener("click", (event) => { if (event.target.closest("a")) set(false); });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && header.classList.contains("is-open")) {
      set(false);
      toggle.focus();
    }
  });
  matchMedia("(min-width: 761px)").addEventListener("change", (e) => { if (e.matches) set(false); });
}

function showAccount(me) {
  const email = typeof me?.user?.email === "string" ? me.user.email : "";
  document.querySelectorAll("[data-auth-out]").forEach((n) => { n.hidden = true; });
  document.querySelectorAll("[data-auth-in]").forEach((n) => {
    n.hidden = false;
    if (email) n.setAttribute("title", email);
  });
  document.querySelectorAll("[data-avatar-initial]").forEach((n) => { n.textContent = (email.trim()[0] || "C").toUpperCase(); });
  if (me?.admin === true) document.querySelectorAll("[data-admin-link]").forEach((n) => { n.hidden = false; });
}

async function checkAccount() {
  if (!sessionHint.has()) return;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}/v1/me`, { credentials: "include", headers: { "X-Carbon-CSRF": "1" }, signal: ctrl.signal });
    if (res.status === 401) return sessionHint.clear();
    if (res.ok) showAccount(await res.json());
  } catch (err) {
    console.debug("Carbon account check skipped:", err?.name || err);
  } finally {
    clearTimeout(timer);
  }
}

export function initNav() {
  const header = document.querySelector(".site-header");
  if (!header) return;
  watchScroll(header);
  phoneMenu(header);
  checkAccount();
}
