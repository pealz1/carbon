/*
  /app-login: desktop app sign-in (PKCE over a loopback redirect, see cloud/API.md).
  The app opens this page with redirect_uri, state, code_challenge and code_challenge_method=S256.
  We sign the user in (or up), call POST /v1/app/authorize with the cookie session,
  and send the browser to the loopback URL the API returns.
*/
import { api, sessionHint, UNAVAILABLE } from "./api.js?v=2";
import { signInFlow, signUpFlow, verifyFlow } from "./flows.js?v=2";
import { formAlert, onSubmit, showStep, wireReveal } from "./ui.js?v=2";

const RESEND_SECONDS = 60;
const RETURN_DELAY_MS = 700;
const REDIRECT_RE = /^http:\/\/127\.0\.0\.1:(\d{1,5})\/carbon-callback$/;

const root = document.querySelector("[data-auth]");
const go = (step) => showStep(root, step);

/** Reads and checks the app's parameters; returns null if anything is off. */
function readRequest() {
  const q = new URLSearchParams(window.location.search);
  const redirectUri = q.get("redirect_uri") || "";
  const state = q.get("state") || "";
  const challenge = q.get("code_challenge") || "";
  const method = q.get("code_challenge_method");
  const port = Number(REDIRECT_RE.exec(redirectUri)?.[1]);
  if (!port || port > 65535) return null;
  if (!/^[\x21-\x7e]{1,512}$/.test(state)) return null;
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(challenge)) return null;
  if (method !== null && method !== "S256") return null;
  return { redirect_uri: redirectUri, state, code_challenge: challenge, code_challenge_method: "S256" };
}

/** Only ever navigate to the loopback callback the app asked for. */
function safeReturnUrl(redirect, request) {
  if (typeof redirect !== "string" || !redirect.startsWith(`${request.redirect_uri}?`)) return null;
  try {
    const url = new URL(redirect);
    const expected = new URL(request.redirect_uri);
    if (url.origin !== expected.origin || url.pathname !== expected.pathname) return null;
    if (url.searchParams.get("state") !== request.state || !url.searchParams.get("code")) return null;
    return url.href;
  } catch {
    return null;
  }
}

function fail(message) {
  root.querySelector("[data-fail-text]").textContent = message;
  go("failed");
}

async function authorize(request) {
  go("authorizing");
  try {
    const res = await api("/v1/app/authorize", { method: "POST", body: request });
    const target = safeReturnUrl(res?.redirect, request);
    if (!target) {
      console.error("Unexpected redirect from /v1/app/authorize:", res?.redirect);
      fail("The sign-in response didn’t match this request, so we stopped for your safety.");
      return;
    }
    root.querySelector("[data-return]").href = target;
    go("done");
    setTimeout(() => window.location.assign(target), RETURN_DELAY_MS);
  } catch (err) {
    if (err?.status === 401) {
      go("login");
      formAlert(root.querySelector('[data-form="login"]'), "Your session ended. Sign in again to continue.", "info");
    } else if (err?.code === "unavailable" || err?.code === "server_misconfigured") {
      fail(UNAVAILABLE);
    } else {
      fail(err?.message || "Something went wrong. Try again from the app.");
    }
  }
}

async function start() {
  const request = readRequest();
  if (!request) { go("invalid"); return; }

  wireReveal(root);
  let pending = null; // { email, password } between sign-up, verification and sign-in

  const signIn = signInFlow(root, {
    onSignedIn: () => authorize(request),
    onNeedsVerify(email, password) {
      pending = { email, password };
      root.querySelector("[data-verify-email]").textContent = email;
      go("verify");
      verify.startCooldown(RESEND_SECONDS);
      verify.focus();
    },
  });

  signUpFlow(root.querySelector('[data-form="signup"]'), {
    onCreated(email, password) {
      pending = { email, password };
      root.querySelector("[data-verify-email]").textContent = email;
      go("verify");
      verify.startCooldown(RESEND_SECONDS);
      verify.focus();
    },
  });

  const verify = verifyFlow(root.querySelector('[data-form="verify"]'), {
    getEmail: () => pending?.email || "",
    async onVerified() {
      const { email, password } = pending;
      pending = null;
      await signIn.signInWith(email, password);
    },
  });

  root.querySelectorAll("[data-go]").forEach((btn) => btn.addEventListener("click", () => go(btn.dataset.go)));

  onSubmit(root.querySelector('[data-form="continue"]'), { run: () => authorize(request) });

  root.querySelector("[data-switch-account]").addEventListener("click", async () => {
    try {
      await api("/v1/auth/logout", { method: "POST" });
    } catch (err) {
      console.warn("Sign-out before switching accounts failed:", err);
    }
    sessionHint.clear();
    go("login");
  });

  try {
    const me = await api("/v1/me");
    const email = me?.user?.email || "";
    root.querySelector("[data-who-email]").textContent = email;
    root.querySelector("[data-who-initial]").textContent = (email[0] || "C").toUpperCase();
    go("continue");
  } catch (err) {
    go("login");
    if (err?.code === "unavailable") formAlert(root.querySelector('[data-form="login"]'), UNAVAILABLE, "info");
  }
}

start();
