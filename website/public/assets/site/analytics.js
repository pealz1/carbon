/*
  First-party visit counts, sent to Carbon's own API (POST /v1/site/hit), which keeps daily
  aggregate counters only. Always sent: the page, the referrer, UTM tags; the server adds device
  class and country and stores no IP address, user agent or id. Only after consent: the first
  visit's source, kept in localStorage, credits later downloads and marks returning visits.
  Do Not Track or Global Privacy Control turn all of it off.
*/
import { API_BASE } from "../auth/api.js?v=5";
import { browserSaysNo, consentState, onConsent } from "./consent.js?v=1";

const FIRST_KEY = "carbon.firstVisit";
const UTM = ["source", "medium", "campaign"];

function thisVisit() {
  const params = new URLSearchParams(window.location.search);
  const utm = {};
  for (const key of UTM) {
    const value = params.get(`utm_${key}`);
    if (value) utm[key] = value.slice(0, 100);
  }
  const touch = {};
  if (document.referrer) touch.ref = document.referrer.slice(0, 500);
  if (Object.keys(utm).length) touch.utm = utm;
  return touch;
}

function readFirst() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(FIRST_KEY) || "null");
    return saved && typeof saved === "object" ? saved : null;
  } catch {
    return null;
  }
}

function forgetFirst() {
  try { window.localStorage.removeItem(FIRST_KEY); } catch { /* nothing stored */ }
}

/** With consent: keeps the first visit's source and reports whether this is a return visit. */
function rememberFirst(current) {
  if (consentState() !== "granted") return null;
  const saved = readFirst();
  if (saved) return { touch: saved, returning: true };
  try { window.localStorage.setItem(FIRST_KEY, JSON.stringify(current)); } catch { /* storage blocked */ }
  return { touch: current, returning: false };
}

function send(body) {
  // text/plain keeps it a simple request (no preflight). No cookies. Failures stay silent.
  window.fetch(`${API_BASE}/v1/site/hit`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "text/plain" },
    credentials: "omit",
    keepalive: true,
  }).catch(() => {});
}

export function initAnalytics() {
  const current = thisVisit();
  onConsent((value) => {
    if (value === "denied") return forgetFirst();
    // Most people allow on the page they landed on: that page's source is the first visit.
    if (!readFirst()) {
      try { window.localStorage.setItem(FIRST_KEY, JSON.stringify(current)); } catch { /* storage blocked */ }
    }
  });
  if (browserSaysNo() || document.body.hasAttribute("data-no-count")) return;
  const path = window.location.pathname;
  const first = rememberFirst(current);
  const visitor = first ? { returning: first.returning } : {};
  send({ kind: "view", path, ...current, ...visitor });

  document.addEventListener("click", (event) => {
    const link = event.target.closest?.("a[data-download]");
    if (!link) return;
    const credit = (consentState() === "granted" && readFirst()) || current;
    send({ kind: "download", path, target: link.dataset.download || "release-page", ...credit, ...visitor });
  });
}
