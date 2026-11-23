/*
  Consent for the one optional thing the site stores: where you first came from (analytics.js),
  kept in this browser's localStorage. Visit counts without it store nothing on the device.
  Global Privacy Control or Do Not Track count as a refusal, and the prompt never shows.
*/
import { el } from "./icons.js?v=1";
import { toast } from "./toast.js?v=1";

const KEY = "carbon.consent";
const listeners = new Set();
let panel;

export const browserSaysNo = () => navigator.globalPrivacyControl === true || navigator.doNotTrack === "1";

function stored() {
  try { return window.localStorage.getItem(KEY); } catch { return null; }
}

/** "granted", "denied", or null while the visitor hasn't chosen. */
export function consentState() {
  if (browserSaysNo()) return "denied";
  const value = stored();
  return value === "granted" || value === "denied" ? value : null;
}

export function onConsent(fn) { listeners.add(fn); }

function choose(value) {
  try { window.localStorage.setItem(KEY, value); } catch { /* storage blocked: the choice lasts this page only */ }
  for (const fn of listeners) fn(value);
}

function close() {
  if (!panel) return;
  const leaving = panel;
  panel = null;
  leaving.classList.add("is-leaving");
  setTimeout(() => leaving.remove(), 300);
}

function answer(value, message) {
  choose(value);
  close();
  toast(message, { tone: "ok" });
}

export function openConsent({ focus = false } = {}) {
  if (panel) return;
  const current = consentState();
  panel = el("section", "consent");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-labelledby", "consent-title");
  const title = el("h2", "", "Remember how you found Carbon?");
  title.id = "consent-title";
  const body = el(
    "p",
    "",
    "The site counts visits without cookies either way. If you allow it, this browser also keeps where you first came from, so we can see which links lead to downloads. It never leaves Carbon.",
  );
  const state = el("p", "", current === "granted" ? "Right now: allowed." : "Right now: rejected.");
  state.hidden = current === null;
  const actions = el("div", "consent__actions");
  const no = el("button", "btn btn--glass", "Reject");
  const yes = el("button", "btn btn--primary", "Allow");
  no.type = yes.type = "button";
  no.addEventListener("click", () => answer("denied", "Saved. Nothing extra is stored."));
  yes.addEventListener("click", () => answer("granted", "Saved. Thanks for helping."));
  actions.append(no, yes);
  const more = el("a", "link consent__more", "What the site counts");
  more.href = "/privacy#analytics";
  panel.append(title, body, state, actions, more);
  panel.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
  document.body.append(panel);
  if (focus) (current === "granted" ? yes : no).focus();
}

export function initConsent() {
  document.addEventListener("click", (event) => {
    if (!event.target.closest?.("[data-consent-open]")) return;
    if (browserSaysNo()) {
      toast("Your browser asks sites not to track you, so the site stores nothing extra.");
      return;
    }
    openConsent({ focus: true });
  });
  if (consentState() === null && !document.body.hasAttribute("data-no-consent")) openConsent();
}
