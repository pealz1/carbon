import { api, sessionHint } from "/assets/auth/api.js?v=5";
import { signUpFlow, signInFlow, verifyFlow } from "/assets/auth/flows.js?v=6";
import { onSubmit, showStep, store, takeFlash, wireReveal, formAlert } from "/assets/auth/ui.js?v=4";

const root = document.querySelector("[data-auth]");
const query = new URLSearchParams(location.search);
const candidates = new Set(["login", "signup", "verify", "forgot", "reset"]);
let mode = query.get("mode");
let invite = store.get("access-key");
const signedIn = () => {
  let destination = "/";
  try {
    const next = new URL(query.get("next") || "/", location.origin);
    if (next.origin === location.origin && next.pathname === "/app-login") destination = next.href;
  } catch { /* An invalid deep link still opens the website. */ }
  location.assign(destination);
};
const formFor = (name) => root.querySelector('[data-form="' + name + '"]');
const go = (step) => showStep(root, step);
const openVerify = () => { go("verify"); verification.startCooldown(); };

wireReveal(root);
const verification = verifyFlow(formFor("verify"), {
  getEmail: () => "",
  onVerified() {
    formFor("login").querySelector('[data-field="email"]').value = store.get("email") || "";
    go("login");
    formAlert(formFor("login"), "Email verified. Sign in to continue.", "ok");
  },
});
signInFlow(root, { onSignedIn: signedIn, onNeedsVerify: openVerify });
signUpFlow(formFor("signup"), {
  getAccessKey: () => invite,
  onCreated(email) {
    invite = null;
    store.del("access-key");
    formFor("verify").querySelector('[data-field="email"]').value = email;
    openVerify();
  },
});

const keyForm = formFor("key");
onSubmit(keyForm, {
  async run() {
    const key = String(new FormData(keyForm).get("key") || "").trim();
    await api("/v1/access/check", { method: "POST", body: { key } });
    invite = key;
    store.set("access-key", key);
    keyForm.reset();
    go("signup");
  },
});

if (!candidates.has(mode) || (mode === "signup" && !invite)) mode = "key";
if (mode === "verify") formFor("verify").querySelector('[data-field="email"]').value = store.get("email") || "";
if (mode !== "key") go(mode);
if (mode === "forgot" || mode === "reset") {
  import("/assets/auth/" + mode + ".js");
} else if (mode === "login") {
  const message = takeFlash();
  if (message) formAlert(formFor("login"), message, "info");
}
if (sessionHint.has()) {
  api("/v1/me").then(signedIn, (error) => { if (error.status === 401) sessionHint.clear(); });
}
