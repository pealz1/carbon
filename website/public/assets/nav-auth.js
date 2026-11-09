/*
  Header account state. The HTML ships signed-out buttons; this swaps in the account
  avatar only when GET /v1/me answers 200. It asks only if this browser has signed in
  before (a hint the auth pages keep in localStorage), so first-time visitors never make
  a credentialed cross-origin request. Any failure leaves the signed-out buttons.
*/
(() => {
  "use strict";

  const API_ME = "https://api.getcarbon.cc/v1/me";
  const HINT_KEY = "carbon.signedIn";
  const TIMEOUT_MS = 3000;

  const readHint = () => {
    try { return window.localStorage.getItem(HINT_KEY) === "1"; } catch { return false; }
  };
  const clearHint = () => {
    try { window.localStorage.removeItem(HINT_KEY); } catch { /* storage blocked: nothing to clear */ }
  };

  function showAccount(user) {
    const email = typeof user?.email === "string" ? user.email : "";
    document.querySelectorAll("[data-auth-out]").forEach((el) => { el.hidden = true; });
    document.querySelectorAll("[data-auth-in]").forEach((el) => {
      el.hidden = false;
      if (email) el.setAttribute("title", email);
    });
    document.querySelectorAll("[data-avatar-initial]").forEach((el) => {
      el.textContent = (email.trim()[0] || "C").toUpperCase();
    });
  }

  async function check() {
    if (!readHint()) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(API_ME, {
        credentials: "include",
        headers: { "X-Carbon-CSRF": "1" },
        signal: ctrl.signal,
      });
      if (res.status === 401) { clearHint(); return; }
      if (!res.ok) return;
      const data = await res.json();
      showAccount(data?.user);
    } catch (err) {
      // Unreachable API or timeout: keep the signed-out buttons (by design).
      console.debug("Carbon account check skipped:", err?.name || err);
    } finally {
      clearTimeout(timer);
    }
  }

  check();
})();
