/* /account: profile, backup codes, sessions, password change and account deletion. */
import { api, sessionHint, UNAVAILABLE } from "./api.js?v=2";
import {
  cooldown, fieldError, formAlert, onSubmit, setBusy, setFlash, showError, wireCode, wirePassword, wireReveal,
} from "./ui.js?v=2";

const LOGIN = "/login?next=%2Faccount";
const CODE_RESEND_SECONDS = 60;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let me = null;

/* ---------- Views ---------- */

function showView(name) {
  $$("[data-view]").forEach((v) => { v.hidden = v.dataset.view !== name; });
  $(`[data-view="${name}"] h1`)?.focus();
}

function pageAlert(text) {
  const box = $("[data-page-alert]");
  box.textContent = text || "";
  box.hidden = !text;
}

/** Any 401 means the session is gone: back to sign-in. */
function guard(err) {
  if (err?.status === 401) {
    sessionHint.clear();
    setFlash("Your session ended. Sign in to continue.");
    window.location.replace(LOGIN);
    return true;
  }
  return false;
}

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const rel = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

function formatDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : dateFmt.format(d);
}

function ago(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "unknown";
  const secs = (d.getTime() - Date.now()) / 1000;
  const units = [["year", 31536000], ["month", 2592000], ["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [unit, size] of units) {
    if (Math.abs(secs) >= size) return rel.format(Math.round(secs / size), unit);
  }
  return "just now";
}

/* ---------- Rendering ---------- */

function renderProfile(data) {
  const user = data.user || {};
  $$("[data-email]").forEach((el) => { el.textContent = user.email || ""; });
  const plus = String(user.plan || "").toLowerCase().includes("plus");
  $("[data-plan]").textContent = plus ? "Carbon+" : "Free";
  $("[data-since]").textContent = formatDate(user.createdAt);
  const left = Number(data.backupCodesRemaining);
  $("[data-backup-count]").textContent = Number.isFinite(left)
    ? `${left} of 10 remaining.`
    : "";
}

function sessionIcon(kind) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "ico");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", kind === "app"
    ? "M18.5 8.2 12 4.5 5.5 8.2v7.6l6.5 3.7 6.5-3.7"
    : "M3 5.5h18v11H3zM8 20h8M12 16.5V20");
  svg.append(path);
  return svg;
}

function renderSessions(sessions) {
  const list = $("[data-sessions]");
  const items = Array.isArray(sessions) ? sessions : [];
  list.replaceChildren(...items.map((s) => {
    const li = document.createElement("li");
    li.className = "session";
    const icon = document.createElement("span");
    icon.className = "session__icon";
    icon.append(sessionIcon(s.kind));
    const text = document.createElement("div");
    const title = document.createElement("b");
    title.textContent = s.kind === "app" ? "Carbon app" : "Web browser";
    if (s.current) {
      const tag = document.createElement("span");
      tag.className = "session__current";
      tag.textContent = "This browser";
      title.append(tag);
    }
    const meta = document.createElement("small");
    meta.textContent = `Signed in ${formatDate(s.createdAt)} · Active ${ago(s.lastSeenAt)}`;
    text.append(title, meta);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn--glass btn--sm";
    btn.textContent = "Sign out";
    btn.setAttribute("aria-label", `Sign out ${title.firstChild.textContent}, signed in ${formatDate(s.createdAt)}`);
    btn.addEventListener("click", () => endSession(s, btn));
    li.append(icon, text, btn);
    return li;
  }));
}

/* ---------- Actions ---------- */

async function load() {
  showView("loading");
  try {
    me = await api("/v1/me");
    sessionHint.set();
    renderProfile(me);
    renderSessions(me.sessions);
    $("[data-signout]").hidden = false;
    showView("ready");
  } catch (err) {
    if (guard(err)) return;
    $("[data-error-text]").textContent = err?.code === "unavailable" ? UNAVAILABLE : (err?.message || "We couldn’t load your account.");
    showView("error");
  }
}

async function refresh() {
  try {
    me = await api("/v1/me");
    renderProfile(me);
    renderSessions(me.sessions);
  } catch (err) {
    guard(err);
  }
}

async function signOut() {
  const btn = $("[data-signout]");
  setBusy(btn, true);
  try {
    await api("/v1/auth/logout", { method: "POST" });
  } catch (err) {
    if (err?.status !== 401) {
      setBusy(btn, false);
      pageAlert(err?.message || "We couldn’t sign you out. Try again.");
      return;
    }
  }
  sessionHint.clear();
  setFlash("You’re signed out.");
  window.location.assign("/login");
}

async function endSession(session, btn) {
  if (session.current) { signOut(); return; }
  const box = $("[data-sessions-alert]");
  box.hidden = true;
  setBusy(btn, true);
  try {
    await api(`/v1/me/sessions/${encodeURIComponent(session.id)}`, { method: "DELETE" });
    pageAlert("That device was signed out.");
    await refresh();
  } catch (err) {
    if (guard(err)) return;
    setBusy(btn, false);
    box.textContent = err?.message || "We couldn’t sign out that device.";
    box.hidden = false;
  }
}

function wireBackupCodes() {
  const form = $('[data-form="backup"]');
  const start = $("[data-backup-start]");
  const out = $("[data-codes]");
  const list = $("[data-codes-list]");
  const download = $("[data-codes-download]");
  let blobUrl = "";

  const toggleForm = (open) => {
    form.hidden = !open;
    start.hidden = open;
    if (open) form.querySelector("input").focus();
    else form.reset();
  };
  $("[data-backup-open]").addEventListener("click", () => toggleForm(true));
  $("[data-backup-cancel]").addEventListener("click", () => toggleForm(false));

  onSubmit(form, {
    validate() {
      const pw = form.querySelector('[data-field="password"]');
      if (!pw.value) { fieldError(pw, "Enter your password."); pw.focus(); return false; }
      return true;
    },
    async run() {
      const res = await api("/v1/me/backup-codes", { method: "POST", body: { password: form.querySelector("input").value } });
      const codes = Array.isArray(res?.codes) ? res.codes.filter((c) => typeof c === "string") : [];
      if (!codes.length) throw new Error("No backup codes in response");
      list.replaceChildren(...codes.map((c) => Object.assign(document.createElement("li"), { textContent: c })));
      const text = `Carbon backup codes for ${me?.user?.email || "your account"}\nEach code works once. Generated ${new Date().toISOString()}\n\n${codes.join("\n")}\n`;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      blobUrl = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
      download.href = blobUrl;
      form.hidden = true;
      form.reset();
      out.hidden = false;
      out.querySelector("[data-codes-copy]").focus();
      refresh();
    },
    onError: (err) => guard(err),
  });

  $("[data-codes-copy]").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const label = btn.querySelector("[data-label]");
    try {
      await navigator.clipboard.writeText([...list.children].map((li) => li.textContent).join("\n"));
      label.textContent = "Copied";
    } catch (err) {
      console.warn("Clipboard unavailable:", err);
      label.textContent = "Select and copy";
      window.getSelection()?.selectAllChildren(list);
    }
    setTimeout(() => { label.textContent = "Copy all"; }, 2000);
  });

  $("[data-codes-done]").addEventListener("click", () => {
    list.replaceChildren();
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = "";
    download.removeAttribute("href");
    out.hidden = true;
    start.hidden = false;
    $("[data-backup-open]").focus();
  });
}

function wirePasswordChange() {
  const form = $('[data-form="password"]');
  const current = form.querySelector('[data-field="currentPassword"]');
  const next = form.querySelector('[data-field="password"]');
  const confirm = form.querySelector('[data-field="confirm"]');
  const emailRef = { get value() { return me?.user?.email || ""; } };
  const pw = wirePassword({ input: next, email: emailRef, rules: form.querySelector("[data-rules]"), meter: form.querySelector("[data-meter]") });
  wireReveal(form);

  onSubmit(form, {
    validate() {
      let bad = null;
      if (!current.value) { fieldError(current, "Enter your current password."); bad ??= current; }
      if (!pw.valid()) { fieldError(next, pw.message()); bad ??= next; }
      if (next.value && next.value === current.value) { fieldError(next, "Choose a password you haven’t used here."); bad ??= next; }
      if (!confirm.value || confirm.value !== next.value) { fieldError(confirm, "Passwords don’t match."); bad ??= confirm; }
      bad?.focus();
      return !bad;
    },
    async run() {
      await api("/v1/me/password", { method: "POST", body: { currentPassword: current.value, newPassword: next.value } });
      form.reset();
      next.dispatchEvent(new Event("input"));
      formAlert(form, "Password changed. Your other sessions were signed out.", "ok");
      refresh();
    },
    onError: (err) => guard(err),
  });
}

function wireDelete() {
  const start = $("[data-del-start]");
  const send = $("[data-del-send]");
  const form = $('[data-form="delete"]');
  const startAlert = $("[data-del-alert]");
  const code = wireCode(form.querySelector(".code"), { autoSubmit: false });
  const codeInput = form.querySelector('[data-field="code"]');
  const pw = form.querySelector('[data-field="password"]');
  const sure = form.querySelector('[data-field="sure"]');

  send.addEventListener("click", async () => {
    startAlert.hidden = true;
    setBusy(send, true);
    try {
      await api("/v1/me/delete-code", { method: "POST" });
      start.hidden = true;
      form.hidden = false;
      codeInput.focus();
    } catch (err) {
      if (guard(err)) return;
      startAlert.textContent = err?.status === 429
        ? "A code was sent recently. Check your email, or try again in a minute."
        : (err?.message || "We couldn’t send a code.");
      startAlert.hidden = false;
      if (err?.status === 429) cooldown(send, err.retryAfter ?? CODE_RESEND_SECONDS, "Email me a code");
    } finally {
      setBusy(send, false);
    }
  });

  $("[data-del-cancel]").addEventListener("click", () => {
    form.hidden = true;
    form.reset();
    code.clear();
    start.hidden = false;
    send.focus();
  });

  onSubmit(form, {
    validate() {
      let bad = null;
      if (code.value().length !== 6) { fieldError(codeInput, "Enter the 6-digit code from your email."); bad ??= codeInput; }
      if (!pw.value) { fieldError(pw, "Enter your password."); bad ??= pw; }
      if (!sure.checked) { fieldError(sure, "Tick the box to confirm."); bad ??= sure; }
      bad?.focus();
      return !bad;
    },
    async run() {
      await api("/v1/me", { method: "DELETE", body: { password: pw.value, code: code.value() } });
      sessionHint.clear();
      setFlash("Your Carbon account was deleted.");
      window.location.replace("/login");
    },
    onError(err) {
      if (guard(err)) return true;
      if (/code|attempt/.test(err?.code || "")) code.clear();
      return false;
    },
  });
}

$("[data-signout]").addEventListener("click", signOut);
$("[data-retry]").addEventListener("click", load);
wireBackupCodes();
wirePasswordChange();
wireDelete();
load();

// Errors that escape a handler still reach the person, not just the console.
window.addEventListener("unhandledrejection", (e) => {
  console.error(e.reason);
  if (!guard(e.reason)) showError($('[data-form="password"]'), e.reason);
});
