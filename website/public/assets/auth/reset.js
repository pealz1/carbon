/* /reset: code + new password. Success revokes every session, so the browser is signed out. */
import { api, sessionHint } from "./api.js?v=2";
import { requireEmail, wireResend } from "./flows.js?v=2";
import { fieldError, formAlert, onSubmit, setFlash, store, takeFlash, wireCode, wirePassword, wireReveal } from "./ui.js?v=2";

const RESEND_SECONDS = 60;
const form = document.querySelector('[data-form="reset"]');
const step = form.closest("[data-step]");
const email = form.querySelector('[data-field="email"]');
const codeInput = form.querySelector('[data-field="code"]');
const password = form.querySelector('[data-field="password"]');
const confirm = form.querySelector('[data-field="confirm"]');
const code = wireCode(form.querySelector(".code"), { autoSubmit: false });
const pw = wirePassword({ input: password, email, rules: form.querySelector("[data-rules]"), meter: form.querySelector("[data-meter]") });

wireReveal(form);
const remembered = store.get("email");
if (remembered) email.value = remembered;
const flash = takeFlash();
if (flash) formAlert(form, flash, "info");
(remembered ? codeInput : email).focus();

const resend = wireResend(
  step.querySelector("[data-resend]"),
  form,
  () => api("/v1/auth/resend", { method: "POST", body: { email: email.value.trim(), purpose: "reset" } }),
  () => Boolean(requireEmail(email)),
);
const sentAt = Number(store.get("sent"));
const left = RESEND_SECONDS - (Date.now() - sentAt) / 1000;
if (sentAt && left > 0) resend.start(left);

onSubmit(form, {
  validate() {
    let bad = null;
    if (!requireEmail(email)) bad ??= email;
    if (code.value().length !== 6) { fieldError(codeInput, "Enter the 6-digit code from your email."); bad ??= codeInput; }
    if (!pw.valid()) { fieldError(password, pw.message()); bad ??= password; }
    if (!confirm.value || confirm.value !== password.value) { fieldError(confirm, "Passwords don’t match."); bad ??= confirm; }
    bad?.focus();
    return !bad;
  },
  async run() {
    const addr = email.value.trim();
    await api("/v1/auth/reset", { method: "POST", body: { email: addr, code: code.value(), password: password.value } });
    sessionHint.clear();
    store.set("email", addr);
    store.del("sent");
    setFlash("Password changed, and every session was signed out. Sign in with your new password.");
    window.location.assign("/login");
  },
  onError(err) {
    if (/code|attempt/.test(err?.code || "")) code.clear();
    return false;
  },
});
