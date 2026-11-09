/* Shared form behaviour for the account pages. */

import { ApiError, UNAVAILABLE } from "./api.js?v=2";

const DEFAULT_COOLDOWN = 60;

/* ---------- Small storage helpers (sessionStorage; never the URL) ---------- */

export const store = {
  get(key) { try { return window.sessionStorage.getItem(`carbon.${key}`); } catch { return null; } },
  set(key, value) { try { window.sessionStorage.setItem(`carbon.${key}`, value); } catch { /* storage blocked: user re-types */ } },
  del(key) { try { window.sessionStorage.removeItem(`carbon.${key}`); } catch { /* nothing stored */ } },
};

/** Message shown once on the next page (e.g. "Email verified"). */
export function setFlash(text) { store.set("flash", text); }
export function takeFlash() {
  const text = store.get("flash");
  store.del("flash");
  return text;
}

/** Same-origin path from ?next=, or the fallback. Resolved by the URL parser, so tricks like "/	/evil.example" fail. */
export function safeNext(fallback = "/account") {
  const raw = new URLSearchParams(window.location.search).get("next");
  if (!raw || !raw.startsWith("/")) return fallback;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function formatClock(total) {
  const s = Math.max(0, Math.ceil(total));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/* ---------- Steps ---------- */

export function showStep(root, name, { focus = true } = {}) {
  root.querySelectorAll("[data-step]").forEach((el) => { el.hidden = el.dataset.step !== name; });
  const step = root.querySelector(`[data-step="${name}"]`);
  if (focus) step?.querySelector("h1, h2")?.focus({ preventScroll: false });
  return step;
}

/* ---------- Busy state and messages ---------- */

export function setBusy(button, busy) {
  if (!button) return;
  if (busy) {
    button.setAttribute("aria-busy", "true");
    button.disabled = true;
    if (!button.querySelector(".spinner")) {
      const s = document.createElement("span");
      s.className = "spinner";
      s.setAttribute("aria-hidden", "true");
      button.append(s);
    }
  } else {
    button.removeAttribute("aria-busy");
    if (!button.dataset.coolingDown) button.disabled = false;
    button.querySelector(".spinner")?.remove();
  }
}

export function formAlert(form, text, kind = "error") {
  const box = form.querySelector("[data-alert]");
  if (!box) return;
  box.className = kind === "error" ? "alert" : `alert alert--${kind}`;
  box.textContent = text || "";
  box.hidden = !text;
}

export function fieldError(input, text) {
  if (!input) return;
  const id = input.getAttribute("aria-errormessage");
  const el = id ? document.getElementById(id) : null;
  if (text) input.setAttribute("aria-invalid", "true");
  else input.removeAttribute("aria-invalid");
  if (el) el.textContent = text || "";
}

export function clearErrors(form) {
  formAlert(form, "");
  form.querySelectorAll("[aria-invalid]").forEach((el) => fieldError(el, ""));
}

/* ---------- Countdown on a button (resend cooldowns, rate limits) ---------- */

export function cooldown(button, seconds, label) {
  if (!button) return () => {};
  const text = button.querySelector("[data-label]") || button;
  const original = button.dataset.label || text.textContent;
  button.dataset.label = original;
  button.dataset.coolingDown = "1";
  button.disabled = true;
  const end = Date.now() + seconds * 1000;
  let timer = 0;
  const finish = () => {
    clearInterval(timer);
    delete button.dataset.coolingDown;
    button.disabled = false;
    text.textContent = original;
  };
  const tick = () => {
    const left = (end - Date.now()) / 1000;
    if (left <= 0) return finish();
    text.textContent = `${label || original} in ${formatClock(left)}`;
  };
  tick();
  timer = setInterval(tick, 250);
  return finish;
}

/* ---------- Mapping API errors onto the form ---------- */

/*
  Server error codes (cloud/src): invalid_credentials, invalid_code, invalid_challenge,
  invalid_grant, invalid_password, weak_password, invalid_request ("field: issue"),
  csrf_failed, forbidden, unauthorized, not_found, rate_limited (429 + Retry-After),
  server_misconfigured, internal_error. Field-level ones are placed on their input here;
  flows handle invalid_credentials, invalid_challenge and invalid_grant themselves.
*/
const FIELD_FOR_CODE = {
  invalid_code: "code",
  invalid_password: "currentPassword",
  weak_password: "password",
};

const REQUEST_FIELD = [
  [/^email/, "email", "Enter a valid email address."],
  [/^(newPassword|password)/, "password", "Check that the password meets the requirements."],
  [/^currentPassword/, "currentPassword", "Enter your current password."],
  [/^code/, "code", "Enter the 6-digit code from your email."],
  [/^backupCode/, "backupCode", "Backup codes look like abcde-12345."],
];

const FIELD_FALLBACK = { currentPassword: "password" };

function findField(form, name) {
  return form.querySelector(`[data-field="${name}"]`)
    || (FIELD_FALLBACK[name] ? form.querySelector(`[data-field="${FIELD_FALLBACK[name]}"]`) : null);
}

/** Returns [input, message] when the error belongs to a specific field. */
function fieldFor(form, err) {
  if (err.code === "invalid_request") {
    for (const [re, name, text] of REQUEST_FIELD) {
      const input = re.test(err.message) ? findField(form, name) : null;
      if (input) return [input, text];
    }
    return [null, "Check the details and try again."];
  }
  const name = FIELD_FOR_CODE[err.code];
  return [name ? findField(form, name) : null, err.message];
}

/**
 * Shows an error from a failed request. Rate limits get a live countdown that also
 * holds the submit button; network failures get the "not available yet" message.
 */
export function showError(form, err, { submit } = {}) {
  if (!(err instanceof ApiError)) {
    console.error(err);
    formAlert(form, "Something went wrong on this page. Reload and try again.");
    return;
  }
  if (err.code === "unavailable" || err.code === "server_misconfigured") {
    formAlert(form, UNAVAILABLE, "info");
    return;
  }
  if (err.status === 429 || (err.status === 423 && err.retryAfter)) {
    const wait = err.retryAfter ?? DEFAULT_COOLDOWN;
    const base = err.status === 423 ? err.message : "Too many attempts.";
    const box = form.querySelector("[data-alert]");
    formAlert(form, `${base} Try again in ${formatClock(wait)}.`);
    const end = Date.now() + wait * 1000;
    const timer = setInterval(() => {
      const left = (end - Date.now()) / 1000;
      if (left <= 0 || box?.hidden) {
        clearInterval(timer);
        if (left <= 0) formAlert(form, "You can try again now.", "info");
        return;
      }
      if (box) box.textContent = `${base} Try again in ${formatClock(left)}.`;
    }, 1000);
    if (submit) cooldown(submit, wait, "Try again");
    return;
  }
  if (err.status >= 500) {
    formAlert(form, "Something went wrong on our side. Try again in a moment.");
    return;
  }
  const [input, text] = fieldFor(form, err);
  if (input) {
    fieldError(input, text);
    input.focus();
  } else {
    formAlert(form, text);
  }
}

/**
 * Wires a form: prevents native submission, runs validate() then run(),
 * keeps the button busy meanwhile and routes failures to showError (or onError).
 */
export function onSubmit(form, { validate, run, onError }) {
  const submit = form.querySelector('[type="submit"]');
  let pending = false;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (pending || submit?.dataset.coolingDown) return;
    clearErrors(form);
    if (validate && !validate()) return;
    pending = true;
    setBusy(submit, true);
    try {
      await run();
    } catch (err) {
      if (!onError || onError(err) !== true) showError(form, err, { submit });
    } finally {
      pending = false;
      setBusy(submit, false);
    }
  });
}

/* ---------- Inputs ---------- */

export function wireReveal(root = document) {
  root.querySelectorAll("[data-reveal]").forEach((btn) => {
    const input = document.getElementById(btn.getAttribute("aria-controls"));
    if (!input) return;
    btn.addEventListener("click", () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.setAttribute("aria-pressed", String(show));
      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
  });
}

/** Six-digit code input mirrored into display boxes; submits the form when complete. */
export function wireCode(container, { autoSubmit = true } = {}) {
  const input = container.querySelector("input");
  const boxes = [...container.querySelectorAll(".code__box")];
  const render = () => {
    const v = input.value;
    boxes.forEach((b, i) => {
      b.textContent = v[i] || "";
      b.classList.toggle("is-filled", Boolean(v[i]));
      b.classList.toggle("is-active", i === Math.min(v.length, boxes.length - 1));
    });
  };
  input.addEventListener("input", () => {
    const digits = input.value.replace(/\D/g, "").slice(0, 6);
    if (digits !== input.value) input.value = digits;
    if (input.getAttribute("aria-invalid")) fieldError(input, "");
    render();
    if (autoSubmit && digits.length === 6) input.form?.requestSubmit();
  });
  input.addEventListener("focus", render);
  render();
  return {
    clear() { input.value = ""; render(); },
    value() { return input.value; },
    focus() { input.focus(); },
  };
}

/* ---------- Password rules (mirrors the server: 10–128 chars, a letter, a number, no email name) ---------- */

const COMMON = new Set([
  "password1234", "password123", "1234567890", "qwerty12345", "qwertyuiop1", "iloveyou123",
  "abc1234567", "1q2w3e4r5t", "password1!", "letmein1234", "welcome1234", "football123",
  "baseball123", "superman123", "spotify1234", "carbon12345", "monkey12345", "dragon12345",
]);

export function passwordChecks(pw, email = "") {
  const local = email.split("@")[0]?.toLowerCase() || "";
  return {
    length: pw.length >= 10 && pw.length <= 128,
    letter: /\p{L}/u.test(pw),
    number: /\d/.test(pw),
    email: !(local.length >= 4 && pw.toLowerCase().includes(local)),
  };
}

export function passwordScore(pw, checks) {
  if (!Object.values(checks).every(Boolean) || COMMON.has(pw.toLowerCase())) return pw ? 1 : 0;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(pw)).length;
  const unique = new Set(pw).size;
  let score = 1;
  if (pw.length >= 12) score += 1;
  if (classes >= 3 || pw.length >= 16) score += 1;
  if (pw.length >= 18 && unique >= 8) score += 1;
  if (unique < 5) score = Math.min(score, 2);
  return Math.min(score, 4);
}

const SCORE_LABEL = ["", "Too weak", "Fair", "Good", "Strong"];

export function wirePassword({ input, email, rules, meter }) {
  const items = rules ? Object.fromEntries([...rules.querySelectorAll("[data-rule]")].map((li) => [li.dataset.rule, li])) : {};
  const meterLabel = meter?.querySelector("span");
  const update = () => {
    const pw = input.value;
    const checks = passwordChecks(pw, email?.value || email?.textContent || "");
    for (const [rule, li] of Object.entries(items)) {
      li.classList.toggle("is-met", Boolean(pw) && checks[rule]);
      const state = li.querySelector(".sr-only");
      if (state) state.textContent = pw && checks[rule] ? " (met)" : " (not met)";
    }
    if (meter) {
      const score = passwordScore(pw, checks);
      meter.dataset.score = String(score);
      if (meterLabel) meterLabel.textContent = pw ? SCORE_LABEL[score] : "";
    }
    return checks;
  };
  input.addEventListener("input", update);
  email?.addEventListener?.("input", update);
  update();
  return {
    valid() {
      const c = update();
      return Object.values(c).every(Boolean) && !COMMON.has(input.value.toLowerCase());
    },
    message() {
      const c = update();
      if (!c.length) return "Use 10 to 128 characters.";
      if (!c.letter) return "Include at least one letter.";
      if (!c.number) return "Include at least one number.";
      if (!c.email) return "Don’t include the name from your email address.";
      if (COMMON.has(input.value.toLowerCase())) return "That password is too common. Try something less predictable.";
      return "";
    },
  };
}
