/*
  Sign-in, sign-up and email-verification flows, shared by the standalone pages
  and the desktop app sign-in page. Each works on markup inside `root`:
    [data-step="login"]  form[data-form="login"]   email, password
    [data-step="2fa"]    form[data-form="2fa"]     .code (6 digits) or backupCode
    [data-step="signup"] form[data-form="signup"]  email, password, confirm, terms
    [data-step="verify"] form[data-form="verify"]  email (if unknown), .code
*/

import { api, sessionHint } from "./api.js?v=3";
import { derivePasswordKey, preloadArgon2 } from "./password-key.js?v=3";
import {
  EMAIL_RE, cooldown, fieldError, formAlert, onSubmit, securing, setBusy, showError, showStep, store,
  wireCode, wirePassword,
} from "./ui.js?v=3";

const RESEND_SECONDS = 60;
const $ = (root, sel) => root.querySelector(sel);
const field = (form, name) => form.querySelector(`[data-field="${name}"]`);

export function requireEmail(input) {
  const v = input.value.trim();
  if (!v) { fieldError(input, "Enter your email address."); input.focus(); return null; }
  if (!EMAIL_RE.test(v) || v.length > 254) { fieldError(input, "Enter a valid email address."); input.focus(); return null; }
  return v;
}

/** A resend button with the 60-second cooldown from the contract. */
export function wireResend(button, form, send, ready = () => true) {
  if (!button) return { start() {} };
  let stop = () => {};
  const start = (secs = RESEND_SECONDS) => { stop(); stop = cooldown(button, secs, "Resend code"); };
  button.addEventListener("click", async () => {
    formAlert(form, "");
    if (!ready()) return;
    button.disabled = true;
    try {
      await send();
      formAlert(form, "We sent a new code. It expires in 10 minutes.", "ok");
      start();
    } catch (err) {
      if (err?.status === 429) {
        formAlert(form, "You can request another code soon.", "info");
        start(err.retryAfter ?? RESEND_SECONDS);
      } else {
        button.disabled = false;
        showError(form, err);
      }
    }
  });
  return { start };
}

/* ---------- Sign in: password, then the emailed code (or a backup code) ---------- */

export function signInFlow(root, { onSignedIn, onNeedsVerify }) {
  const loginForm = $(root, '[data-form="login"]');
  const tfaForm = $(root, '[data-form="2fa"]');
  const email = field(loginForm, "email");
  const password = field(loginForm, "password");
  const backup = field(tfaForm, "backupCode");
  const code = wireCode($(tfaForm, ".code"));
  const codeInput = field(tfaForm, "code");
  const tfaStep = tfaForm.closest("[data-step]") || tfaForm;
  const codeWrap = $(tfaForm, "[data-code-mode]");
  const backupWrap = $(tfaForm, "[data-backup-mode]");
  const toggle = $(tfaStep, "[data-toggle-backup]");
  const emailOut = $(root, "[data-2fa-email]");
  let challenge = null;
  let useBackup = false;

  const remembered = store.get("email");
  if (remembered && !email.value) email.value = remembered;
  password.addEventListener("focus", preloadArgon2, { once: true });

  const resend = wireResend($(tfaStep, "[data-resend]"), tfaForm, () => api("/v1/auth/resend", { method: "POST", body: { challenge } }));

  const setBackupMode = (on) => {
    useBackup = on;
    codeWrap.hidden = on;
    backupWrap.hidden = !on;
    codeInput.required = !on;
    backup.required = on;
    toggle.textContent = on ? "Use the emailed code instead" : "Use a backup code";
    (on ? backup : codeInput).focus();
  };
  toggle.addEventListener("click", () => setBackupMode(!useBackup));

  const restart = (message) => {
    challenge = null;
    code.clear();
    backup.value = "";
    showStep(root, "login");
    if (message) formAlert(loginForm, message, "info");
    password.focus();
  };
  $(tfaStep, "[data-restart]")?.addEventListener("click", () => restart());

  onSubmit(loginForm, {
    validate() {
      if (!requireEmail(email)) return false;
      if (!password.value) { fieldError(password, "Enter your password."); password.focus(); return false; }
      return true;
    },
    async run() {
      const addr = email.value.trim();
      const passwordKey = await securing(loginForm, () => derivePasswordKey(password.value, addr));
      const res = await api("/v1/auth/login", { method: "POST", body: { email: addr, passwordKey } });
      store.set("email", addr);
      // A remembered device signs straight in (no emailed code); otherwise the 2FA step follows.
      if (res?.next === "done") {
        sessionHint.set();
        password.value = "";
        await onSignedIn(res.user ?? null);
        return;
      }
      if (res?.next !== "2fa" || typeof res.challenge !== "string") throw new Error("Unexpected sign-in response");
      challenge = res.challenge;
      if (emailOut) emailOut.textContent = addr;
      code.clear();
      showStep(root, "2fa", { focus: false });
      setBackupMode(false);
      resend.start();
    },
    onError(err) {
      // Unverified accounts get the same 401 as a wrong password (no account enumeration),
      // so offer the verification path alongside the error.
      if (err?.code === "invalid_credentials") {
        formAlert(loginForm, "Wrong email or password.");
        if (unverified) unverified.hidden = false;
        password.focus();
        return true;
      }
      return false;
    },
  });

  const unverified = $(root, "[data-unverified]");
  const resendVerify = unverified && $(unverified, "[data-resend-verify]");
  resendVerify?.addEventListener("click", async () => {
    const addr = requireEmail(email);
    if (!addr) return;
    setBusy(resendVerify, true);
    const go = (sentAt) => {
      store.set("email", addr);
      store.set("sent", String(sentAt));
      onNeedsVerify?.(addr, password.value);
    };
    try {
      await api("/v1/auth/resend", { method: "POST", body: { email: addr, purpose: "verify_email" } });
      go(Date.now());
    } catch (err) {
      setBusy(resendVerify, false);
      // A code went out recently: continue to verification with the remaining cooldown.
      if (err?.status === 429) go(Date.now() - (RESEND_SECONDS - (err.retryAfter ?? RESEND_SECONDS)) * 1000);
      else showError(loginForm, err);
    }
  });

  onSubmit(tfaForm, {
    validate() {
      if (useBackup) {
        const v = backup.value.trim().toLowerCase();
        if (!/^[a-z0-9]{5}-[a-z0-9]{5}$/.test(v)) { fieldError(backup, "Backup codes look like abcde-12345."); backup.focus(); return false; }
        return true;
      }
      if (code.value().length !== 6) { fieldError(codeInput, "Enter the 6-digit code from your email."); code.focus(); return false; }
      return true;
    },
    async run() {
      const body = useBackup ? { challenge, backupCode: backup.value.trim().toLowerCase() } : { challenge, code: code.value() };
      const res = await api("/v1/auth/2fa", { method: "POST", body });
      sessionHint.set();
      password.value = "";
      await onSignedIn(res?.user ?? null);
    },
    onError(err) {
      if (/challenge/.test(err?.code || "") || err?.status === 410) {
        restart("That sign-in expired. Enter your password again to get a new code.");
        return true;
      }
      if (err?.code === "invalid_code" && useBackup) {
        fieldError(backup, "That backup code isn’t valid or was already used.");
        backup.focus();
        return true;
      }
      if (!useBackup && /code|attempt/.test(err?.code || "")) code.clear();
      return false;
    },
  });

  /** Lets another flow (sign-up → verify) continue straight into sign-in. */
  return {
    async signInWith(addr, pw) {
      email.value = addr;
      password.value = pw;
      showStep(root, "login", { focus: false });
      loginForm.requestSubmit();
    },
  };
}

/* ---------- Sign up ---------- */

export function signUpFlow(form, { onCreated }) {
  const email = field(form, "email");
  const password = field(form, "password");
  const confirm = field(form, "confirm");
  const terms = field(form, "terms");
  const pw = wirePassword({ input: password, email, rules: $(form, "[data-rules]"), meter: $(form, "[data-meter]") });
  password.addEventListener("focus", preloadArgon2, { once: true });

  confirm.addEventListener("input", () => {
    if (confirm.getAttribute("aria-invalid") && confirm.value === password.value) fieldError(confirm, "");
  });

  onSubmit(form, {
    validate() {
      let firstBad = null;
      if (!requireEmail(email)) firstBad ??= email;
      if (!pw.valid()) { fieldError(password, pw.message()); firstBad ??= password; }
      if (!confirm.value || confirm.value !== password.value) { fieldError(confirm, "Passwords don’t match."); firstBad ??= confirm; }
      if (!terms.checked) { fieldError(terms, "Please accept the Terms of Use and Privacy Policy."); firstBad ??= terms; }
      firstBad?.focus();
      return !firstBad;
    },
    async run() {
      const addr = email.value.trim();
      const passwordKey = await securing(form, () => derivePasswordKey(password.value, addr));
      const res = await api("/v1/auth/signup", { method: "POST", body: { email: addr, passwordKey } });
      if (res?.next && res.next !== "verify_email") console.warn("Unexpected signup step:", res.next);
      store.set("email", addr);
      await onCreated(addr, password.value);
    },
  });

  terms.addEventListener("change", () => { if (terms.checked) fieldError(terms, ""); });
}

/* ---------- Verify email ---------- */

export function verifyFlow(form, { getEmail, onVerified }) {
  const emailInput = field(form, "email");
  const codeInput = field(form, "code");
  const code = wireCode($(form, ".code"));
  const emailOf = () => getEmail() || emailInput?.value.trim() || "";

  const emailKnown = () => Boolean(getEmail()) || Boolean(emailInput && requireEmail(emailInput));
  const resend = wireResend(
    $(form.closest("[data-step]") || form, "[data-resend]"),
    form,
    () => api("/v1/auth/resend", { method: "POST", body: { email: emailOf(), purpose: "verify_email" } }),
    emailKnown,
  );

  onSubmit(form, {
    validate() {
      if (emailInput && !emailInput.closest("[hidden]") && !requireEmail(emailInput)) return false;
      if (code.value().length !== 6) { fieldError(codeInput, "Enter the 6-digit code from your email."); code.focus(); return false; }
      return true;
    },
    async run() {
      await api("/v1/auth/verify-email", { method: "POST", body: { email: emailOf(), code: code.value() } });
      await onVerified(emailOf());
    },
    onError(err) {
      if (/code|attempt/.test(err?.code || "")) code.clear();
      return false;
    },
  });

  return { startCooldown: (secs) => resend.start(secs), focus: () => code.focus() };
}
