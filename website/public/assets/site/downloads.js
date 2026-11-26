/*
  Installers and project stats from the GitHub API for pealz1/carbon (public, no auth, cached for
  ten minutes per tab because unauthenticated calls are limited to 60 an hour per address).
  The HTML ships working links to the release page; everything here only improves on them.
*/
import { el, icon } from "./icons.js?v=1";

export const RELEASE_PAGE = "/changelog";
const DOWNLOAD_PREFIX = "/downloads/";
const CACHE_MS = 10 * 60 * 1000;

const OS_NAME = { windows: "Windows", macos: "macOS", linux: "Linux" };
const OS_ORDER = ["windows", "macos", "linux"];
const TYPE_ORDER = ["exe", "msi", "dmg", "appimage", "deb", "rpm"];
const ARCH_ORDER = ["universal", "x64", "arm64"];
const ARCH_NAME = { x64: "x64", arm64: "ARM64", universal: "Universal" };

async function cached(key, url) {
  try {
    const hit = JSON.parse(sessionStorage.getItem(key) || "null");
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  } catch { /* no cache */ }
  const res = await fetch(url, { credentials: "same-origin", headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Downloads answered ${res.status}`);
  const data = await res.json();
  try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data })); } catch { /* storage full or blocked */ }
  return data;
}

/** One release asset as an installer, or null for signatures, update manifests and archives. */
export function describe(asset) {
  const url = asset?.browser_download_url;
  if (typeof url !== "string" || !url.startsWith(DOWNLOAD_PREFIX) || !/^\/downloads\/v\d+\.\d+\.\d+\/[A-Za-z0-9._-]+$/.test(url)) return null;
  const name = String(asset.name).toLowerCase();
  const type = TYPE_ORDER.find((t) => name.endsWith(`.${t}`));
  if (!type) return null;
  const arch = name.includes("universal") ? "universal" : /arm64|aarch64/.test(name) ? "arm64" : "x64";
  const os = type === "exe" || type === "msi" ? "windows" : type === "dmg" ? "macos" : "linux";
  let label;
  if (os === "macos") label = { universal: "Universal disk image", arm64: "Apple silicon disk image", x64: "Intel disk image" }[arch];
  else if (os === "windows") label = type === "msi" ? `${ARCH_NAME[arch]} MSI package` : `${ARCH_NAME[arch]} installer`;
  else label = `${type === "appimage" ? "AppImage" : type.toUpperCase()} · ${ARCH_NAME[arch]}`;
  return {
    os,
    type,
    arch,
    label,
    url,
    key: `${os}-${arch}-${type}`,
    size: `${Math.max(1, Math.round(Number(asset.size) / 1e6))} MB`,
    downloads: Number(asset.download_count) || 0,
  };
}

const rank = (i) => TYPE_ORDER.indexOf(i.type) * 10 + ARCH_ORDER.indexOf(i.arch);

export function installersOf(release) {
  return (release?.assets ?? []).map(describe).filter(Boolean).sort((a, b) => rank(a) - rank(b));
}

export function detectOS(nav = navigator) {
  const ua = nav.userAgent || "";
  if (/android|iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && nav.maxTouchPoints > 1)) return "mobile";
  if (/windows/i.test(ua)) return "windows";
  if (/macintosh|mac os x/i.test(ua)) return "macos";
  if (/linux|x11|cros/i.test(ua)) return "linux";
  return null;
}

export function recommended(installers, os) {
  const first = (type, arch) => installers.find((i) => i.type === type && (!arch || i.arch === arch));
  if (os === "windows") return first("exe", "x64") ?? first("exe") ?? first("msi");
  if (os === "macos") return first("dmg", "universal") ?? first("dmg");
  if (os === "linux") return first("appimage", "x64") ?? first("deb", "x64") ?? first("appimage");
  return null;
}

const dateOf = (iso) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

function menuItem(installer, version) {
  const a = el("a", "menu__item");
  a.setAttribute("role", "menuitem");
  a.href = installer.url;
  a.dataset.download = installer.key;
  a.append(el("span", "", installer.label), el("small", "", `${version} · .${installer.type} · ${installer.size}`), icon("download"));
  return a;
}

function fillMenu(menu, installers, version, os) {
  const groups = OS_ORDER.map((key) => [key, installers.filter((i) => i.os === key)]).filter(([, list]) => list.length);
  if (os && OS_ORDER.includes(os)) groups.sort(([a], [b]) => (a === os ? -1 : b === os ? 1 : 0));
  const nodes = groups.map(([key, list]) => {
    const group = el("div", "menu__group");
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", OS_NAME[key]);
    const head = el("p", "menu__head");
    head.append(icon(key), el("span", "", OS_NAME[key]));
    group.append(head, ...list.map((i) => menuItem(i, version)));
    return group;
  });
  menu.querySelector("[data-dl-groups]")?.replaceChildren(...nodes);
}

function fillSplit(split, best, version) {
  const main = split.querySelector("[data-dl-main]");
  if (!main || !best) return;
  main.href = best.url;
  main.dataset.download = best.key;
  const text = main.querySelector("[data-dl-text]");
  if (text && !split.hasAttribute("data-dl-keep-label")) text.textContent = `Download for ${OS_NAME[best.os]}`;
  const meta = main.querySelector("[data-dl-meta]");
  if (meta) {
    meta.textContent = `${version} · .${best.type} · ${best.size}`;
    meta.classList.remove("is-pending");
  }
}

function fillLists(installers, version) {
  document.querySelectorAll("[data-os-list]").forEach((list) => {
    const mine = installers.filter((i) => i.os === list.dataset.osList);
    if (!mine.length) return;
    list.replaceChildren(
      ...mine.map((i) => {
        const li = el("li");
        const a = el("a", "file");
        a.href = i.url;
        a.dataset.download = i.key;
        const name = el("span", "file__name", i.label);
        const meta = el("span", "file__meta", `.${i.type} · ${i.size}`);
        a.append(name, meta, icon("download"));
        li.append(a);
        return li;
      }),
    );
  });
  document.querySelectorAll("[data-release-version]").forEach((n) => { n.textContent = version; });
}

function showStat(name, value) {
  document.querySelectorAll(`[data-stat="${name}"]`).forEach((n) => {
    n.textContent = value;
    n.closest("[data-stat-wrap]")?.removeAttribute("hidden");
  });
}

export async function initDownloads() {
  const os = detectOS();
  document.documentElement.dataset.os = os ?? "unknown";
  if (!document.querySelector("[data-dl], [data-os-list], [data-release-version]")) return;
  try {
    const catalog = await cached("carbon.private.catalog", "/downloads/catalog.json");
    const release = catalog.releases?.[0];
    if (catalog.releases?.length) showStat("releases", String(catalog.releases.length));
    const installers = installersOf(release);
    const version = String(release?.tag_name || "").slice(0, 20);
    if (!installers.length) return;
    const best = recommended(installers, os);
    document.querySelectorAll("[data-dl]").forEach((split) => {
      fillSplit(split, best, version);
      const menu = split.querySelector(".menu");
      if (menu) fillMenu(menu, installers, version, os);
    });
    fillLists(installers, version);
    if (release?.published_at) showStat("released", dateOf(release.published_at));
    document.querySelectorAll(`[data-os-card="${os}"]`).forEach((card) => card.classList.add("is-yours"));
  } catch (err) {
    // The static links to the release page keep working.
    console.debug("Carbon installers skipped:", err?.message || err);
    document.querySelectorAll("[data-dl-meta].is-pending").forEach((m) => { m.hidden = true; });
    document.querySelectorAll("[data-dl-groups]").forEach((g) => g.replaceChildren(el("p", "menu__empty", "Couldn’t load the installer list. Every file is on the release page.")));
  }
}
