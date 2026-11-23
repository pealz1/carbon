/*
  /admin: traffic, accounts and bans. The page only renders what the API returns; every
  /v1/admin call is checked server-side (admin role, CSRF, rate limits). All text from the API
  is set with textContent, never as markup.
*/
import { api } from "../auth/api.js?v=4";
import { barList, lineChart } from "./charts.js?v=1";
import { el } from "./icons.js?v=1";
import { toast } from "./toast.js?v=1";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const fmt = new Intl.NumberFormat();
const DAY_MS = 86_400_000;
const regionName = (() => {
  try { return new Intl.DisplayNames(undefined, { type: "region" }); } catch { return null; }
})();
const SOURCE_NAMES = { direct: "Direct or unknown", other: "Other apps and links", internal: "Carbon’s own pages" };
const DEVICE_NAMES = { desktop: "Desktop", mobile: "Phone", tablet: "Tablet", other: "Unknown" };
const VISITOR_NAMES = { new: "New", returning: "Returning", unknown: "Didn’t say" };

const state = { days: 30, q: "", status: "all", page: 0, pageSize: 50, total: 0 };
let me = null;

function show(view) {
  $$("[data-admin-view]").forEach((node) => { node.hidden = node.dataset.adminView !== view; });
}

function dateOf(iso) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "–";
}

function ago(iso) {
  if (!iso) return "Never";
  const days = Math.floor((Date.now() - Date.parse(iso)) / DAY_MS);
  if (days < 1) return "Today";
  if (days < 2) return "Yesterday";
  if (days < 60) return `${days} days ago`;
  return dateOf(iso);
}

/** Every day in the range, oldest first, with 0 where the API had no row. */
function fillDays(since, rows, pick) {
  const byDay = new Map();
  for (const r of rows) if (pick(r)) byDay.set(r.day, (byDay.get(r.day) ?? 0) + Number(r.n));
  const out = [];
  for (let t = Date.parse(`${since}T00:00:00Z`); t <= Date.now(); t += DAY_MS) {
    const day = new Date(t).toISOString().slice(0, 10);
    out.push({ day, n: byDay.get(day) ?? 0 });
  }
  return out;
}

function handleError(err, fallback) {
  if (err?.status === 401) return show("signin");
  if (err?.status === 403 && err?.code === "forbidden") return show("forbidden");
  toast(err?.message || fallback, { tone: "err" });
}

/* ---------- Traffic ---------- */

async function loadOverview() {
  const kpis = $("[data-kpis]");
  kpis.setAttribute("aria-busy", "true");
  try {
    const data = await api(`/v1/admin/overview?days=${state.days}`);
    const views = fillDays(data.since, data.series, (r) => r.kind === "view");
    const downloads = fillDays(data.since, data.series, (r) => r.kind === "download");
    const signups = fillDays(data.since, data.signups, () => true);
    const sum = (list) => list.reduce((a, p) => a + p.n, 0);
    const totalViews = sum(views);
    const totalDownloads = sum(downloads);
    const set = (key, text) => { $(`[data-kpi="${key}"]`).textContent = text; };
    set("views", fmt.format(totalViews));
    set("downloads", fmt.format(totalDownloads));
    set("rate", totalViews ? (totalDownloads / totalViews * 100).toFixed(1) : "–");
    set("signups", fmt.format(Number(data.accounts.recent)));
    set("accounts", fmt.format(Number(data.accounts.total)));
    set("accounts-note", `${fmt.format(Number(data.accounts.verified))} verified · ${fmt.format(Number(data.accounts.banned))} banned`);

    lineChart($('[data-chart="views"]'), views, "Page views");
    lineChart($('[data-chart="downloads"]'), downloads, "Download clicks");
    $("[data-daily]").replaceChildren(
      ...views.map((v, i) => {
        const tr = el("tr");
        tr.append(el("th", "", v.day), el("td", "", fmt.format(v.n)), el("td", "", fmt.format(downloads[i].n)), el("td", "", fmt.format(signups[i]?.n ?? 0)));
        tr.firstChild.scope = "row";
        return tr;
      }).reverse(),
    );

    const sourceName = (k) => SOURCE_NAMES[k] ?? k;
    barList($('[data-bars="sources"]'), data.sources, { name: sourceName });
    barList($('[data-bars="pages"]'), data.pages);
    barList($('[data-bars="downloads"]'), data.downloads, { name: (k) => (k === "release-page" ? "GitHub release page" : k) });
    barList($('[data-bars="downloadSources"]'), data.downloadSources, { name: sourceName });
    barList($('[data-bars="countries"]'), data.countries, { name: (k) => (k === "XX" ? "Unknown" : regionName?.of(k) ?? k) });
    barList($('[data-bars="devices"]'), data.devices, { name: (k) => DEVICE_NAMES[k] ?? k });
    barList($('[data-bars="visitors"]'), data.visitors, { name: (k) => VISITOR_NAMES[k] ?? k });
    const campaigns = data.campaigns.map((c) => {
      const tr = el("tr");
      tr.append(el("td", "", c.source), el("td", "", c.medium || "–"), el("td", "", c.campaign), el("td", "mono", fmt.format(Number(c.n))));
      return tr;
    });
    if (!campaigns.length) {
      const tr = el("tr");
      const td = el("td", "atable__empty", "No links with UTM tags yet.");
      td.colSpan = 4;
      tr.append(td);
      campaigns.push(tr);
    }
    $("[data-campaigns]").replaceChildren(...campaigns);
  } catch (err) {
    handleError(err, "Couldn’t load traffic.");
  } finally {
    kpis.removeAttribute("aria-busy");
  }
}

/* ---------- Accounts ---------- */

function statusBadge(user) {
  if (user.bannedAt) return el("span", "badge badge--err", "Banned");
  if (!user.verifiedAt) return el("span", "badge", "Unverified");
  return el("span", "badge badge--ok", "Active");
}

function userRow(user) {
  const tr = el("tr");
  tr.dataset.id = user.id;
  const who = el("th", "");
  who.scope = "row";
  who.append(el("span", "atable__email", user.email));
  if (user.admin) who.append(el("span", "badge badge--admin", "Admin"));
  if (user.banReason) who.append(el("small", "atable__reason", `Reason: ${user.banReason}`));
  const status = el("td");
  status.append(statusBadge(user));
  const action = el("td", "atable__action");
  if (!user.admin && user.id !== me?.user?.id) {
    const btn = el("button", `btn btn--sm ${user.bannedAt ? "btn--glass" : "btn--danger"}`);
    btn.type = "button";
    btn.append(el("span", "", user.bannedAt ? "Unban" : "Ban"));
    btn.setAttribute("aria-label", `${user.bannedAt ? "Unban" : "Ban"} ${user.email}`);
    btn.addEventListener("click", () => askBan(user, btn));
    action.append(btn);
  }
  tr.append(who, status, el("td", "", dateOf(user.createdAt)), el("td", "", ago(user.lastSeenAt)), el("td", "mono", String(user.sessions)), action);
  return tr;
}

async function loadUsers() {
  const body = $("[data-users]");
  body.setAttribute("aria-busy", "true");
  try {
    const params = new URLSearchParams({ q: state.q, status: state.status, page: String(state.page) });
    const data = await api(`/v1/admin/users?${params}`);
    state.total = Number(data.total);
    state.pageSize = Number(data.pageSize) || 50;
    if (!data.users.length) {
      const tr = el("tr");
      const td = el("td", "atable__empty", state.q ? "No account matches that search." : "No accounts here.");
      td.colSpan = 6;
      tr.append(td);
      body.replaceChildren(tr);
    } else {
      body.replaceChildren(...data.users.map(userRow));
    }
    const first = state.total ? state.page * state.pageSize + 1 : 0;
    const last = Math.min(state.total, (state.page + 1) * state.pageSize);
    $("[data-page-label]").textContent = `${fmt.format(first)}–${fmt.format(last)} of ${fmt.format(state.total)}`;
    $("[data-users-count]").textContent = `${fmt.format(state.total)} ${state.status === "all" ? "in total" : state.status}`;
    $('[data-page="-1"]').disabled = state.page === 0;
    $('[data-page="1"]').disabled = last >= state.total;
  } catch (err) {
    handleError(err, "Couldn’t load accounts.");
  } finally {
    body.removeAttribute("aria-busy");
  }
}

/* ---------- Bans ---------- */

const dialog = () => $("[data-ban-dialog]");

function askBan(user, button) {
  const banning = !user.bannedAt;
  const d = dialog();
  $("[data-ban-title]").textContent = banning ? "Ban this account?" : "Unban this account?";
  $("[data-ban-text]").textContent = banning
    ? `${user.email} will be signed out everywhere and can’t sign in until you unban it.`
    : `${user.email} will be able to sign in again.`;
  $("[data-ban-confirm] [data-label]").textContent = banning ? "Ban account" : "Unban account";
  $("[data-ban-confirm]").className = `btn ${banning ? "btn--danger" : "btn--primary"}`;
  $("[data-ban-reason]").value = "";
  $("[data-ban-alert]").hidden = true;
  d.dataset.userId = user.id;
  d.dataset.action = banning ? "ban" : "unban";
  d.returnFocusTo = button;
  d.showModal();
  $("[data-ban-reason]").focus();
}

async function confirmBan(event) {
  event.preventDefault();
  const d = dialog();
  const confirm = $("[data-ban-confirm]");
  const alert = $("[data-ban-alert]");
  const reason = $("[data-ban-reason]").value.trim();
  confirm.setAttribute("aria-busy", "true");
  confirm.append(el("span", "spinner"));
  alert.hidden = true;
  try {
    const { user } = await api(`/v1/admin/users/${encodeURIComponent(d.dataset.userId)}/${d.dataset.action}`, {
      method: "POST",
      body: reason ? { reason } : {},
    });
    d.close();
    toast(user.bannedAt ? `Banned ${user.email}. Their sessions were revoked.` : `Unbanned ${user.email}.`, { tone: "ok" });
    const row = $(`[data-users] tr[data-id="${CSS.escape(user.id)}"]`);
    row?.replaceWith(userRow(user));
    loadAudit();
    loadOverview();
  } catch (err) {
    if (err?.status === 401) { d.close(); return show("signin"); }
    alert.textContent = err?.message || "That didn’t work. Try again.";
    alert.hidden = false;
  } finally {
    confirm.removeAttribute("aria-busy");
    confirm.querySelector(".spinner")?.remove();
  }
}

async function loadAudit() {
  const list = $("[data-audit]");
  try {
    const { entries } = await api("/v1/admin/audit");
    if (!entries.length) {
      list.replaceChildren(el("li", "audit__empty", "No bans yet."));
      return;
    }
    list.replaceChildren(
      ...entries.map((e) => {
        const li = el("li", `audit__row audit__row--${e.action === "ban" ? "ban" : "unban"}`);
        const what = el("p");
        what.append(el("b", "", e.action === "ban" ? "Banned " : "Unbanned "), el("span", "", e.target));
        const meta = el("p", "audit__meta", `${new Date(e.at).toLocaleString()} · by ${e.actor}${e.reason ? ` · ${e.reason}` : ""}`);
        li.append(what, meta);
        return li;
      }),
    );
  } catch (err) {
    handleError(err, "Couldn’t load the ban log.");
  }
}

/* ---------- Controls ---------- */

function wireControls() {
  $$("[data-days]").forEach((item) => {
    item.addEventListener("click", () => {
      state.days = Number(item.dataset.days);
      $$("[data-days]").forEach((i) => i.setAttribute("aria-checked", String(i === item)));
      $("[data-range-label]").textContent = item.textContent.trim();
      loadOverview();
    });
  });
  $("[data-admin-refresh]").addEventListener("click", async () => {
    await Promise.all([loadOverview(), loadUsers(), loadAudit()]);
    toast("Up to date.", { tone: "ok", timeout: 1800 });
  });
  let timer = 0;
  $("[data-users-q]").addEventListener("input", (event) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.q = event.target.value.trim().slice(0, 100);
      state.page = 0;
      loadUsers();
    }, 300);
  });
  $("[data-users-status]").addEventListener("change", (event) => {
    state.status = event.target.value;
    state.page = 0;
    loadUsers();
  });
  $$("[data-page]").forEach((btn) => btn.addEventListener("click", () => {
    state.page = Math.max(0, state.page + Number(btn.dataset.page));
    loadUsers();
  }));
  const d = dialog();
  $("[data-ban-form]").addEventListener("submit", confirmBan);
  $("[data-ban-cancel]").addEventListener("click", () => d.close());
  d.addEventListener("close", () => d.returnFocusTo?.focus());
  $("[data-admin-retry]").addEventListener("click", boot);
}

async function boot() {
  show("loading");
  try {
    me = await api("/v1/me");
    if (me.admin !== true) return show("forbidden");
    $("[data-admin-email]").textContent = me.user?.email ?? "";
    show("ready");
    await Promise.all([loadOverview(), loadUsers(), loadAudit()]);
  } catch (err) {
    if (err?.status === 401) return show("signin");
    $("[data-admin-error]").textContent = err?.message || "The accounts API didn’t answer. Try again in a moment.";
    show("unavailable");
  }
}

if ($("[data-admin]")) {
  wireControls();
  boot();
}
