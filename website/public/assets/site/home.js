/* Home page: hero parallax, the lyrics demo, donations, the supporters wall and quotes. */
import { el } from "./icons.js?v=1";
import { initLyrics } from "./lyrics.js?v=1";

const MAX_URL = 500;
const isText = (v, max) => typeof v === "string" && v.trim().length > 0 && v.length <= max;

function httpsUrl(value) {
  if (!isText(value, MAX_URL)) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password ? u : null;
  } catch {
    return null;
  }
}

async function getJson(path) {
  // /assets/* is immutable, but these files change without a version bump.
  const res = await fetch(path, { cache: "no-cache", headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return res.json();
}

/* ---------- Hero: the stack leans toward the pointer ---------- */

function initParallax() {
  const rig = document.querySelector("[data-rig]");
  const hero = rig?.closest(".hero");
  if (!rig || matchMedia("(prefers-reduced-motion: reduce), (pointer: coarse)").matches) return;
  let frame = 0;
  let px = 0;
  let py = 0;
  const apply = () => {
    frame = 0;
    rig.style.setProperty("--px", px.toFixed(3));
    rig.style.setProperty("--py", py.toFixed(3));
  };
  hero.addEventListener("pointermove", (event) => {
    const box = hero.getBoundingClientRect();
    px = ((event.clientX - box.left) / box.width) * 2 - 1;
    py = ((event.clientY - box.top) / box.height) * 2 - 1;
    frame ||= requestAnimationFrame(apply);
  });
  hero.addEventListener("pointerleave", () => {
    px = 0;
    py = 0;
    frame ||= requestAnimationFrame(apply);
  });
}

/* ---------- Feature panels: tilt toward the pointer; illustrations move only while on screen ---------- */

const TILT_X = 7;
const TILT_Y = 9;

function initBento() {
  const tiles = [...document.querySelectorAll("[data-bento] .tile")];
  if (!tiles.length) return;
  const live = new IntersectionObserver((entries) => {
    for (const e of entries) e.target.classList.toggle("is-live", e.isIntersecting);
  }, { threshold: 0.2 });
  tiles.forEach((tile) => live.observe(tile));

  if (matchMedia("(prefers-reduced-motion: reduce), (pointer: coarse)").matches) return;
  for (const tile of tiles) {
    const panel = tile.querySelector(".tile__in");
    let frame = 0;
    let point = null;
    const apply = () => {
      frame = 0;
      if (!point) {
        panel.style.setProperty("--rx", "0deg");
        panel.style.setProperty("--ry", "0deg");
        return;
      }
      const box = panel.getBoundingClientRect();
      const x = (point.x - box.left) / box.width;
      const y = (point.y - box.top) / box.height;
      panel.style.setProperty("--rx", `${((0.5 - y) * TILT_X).toFixed(2)}deg`);
      panel.style.setProperty("--ry", `${((x - 0.5) * TILT_Y).toFixed(2)}deg`);
      panel.style.setProperty("--gx", `${(x * 100).toFixed(1)}%`);
      panel.style.setProperty("--gy", `${(y * 100).toFixed(1)}%`);
    };
    tile.addEventListener("pointermove", (event) => {
      point = { x: event.clientX, y: event.clientY };
      frame ||= requestAnimationFrame(apply);
    });
    tile.addEventListener("pointerleave", () => {
      point = null;
      frame ||= requestAnimationFrame(apply);
    });
  }
}

/* ---------- Donations: /assets/support.json ----------
   { "stripeOnce": "https://donate.stripe.com/…", "stripeMonthly": "https://buy.stripe.com/…",
     "stripeManage": "https://billing.stripe.com/p/login/…", "githubSponsors": "https://github.com/sponsors/…" }
   A link shows only for a set, valid URL on its expected host. */

const DONATE = {
  stripeOnce: { host: "donate.stripe.com", path: "/" },
  stripeMonthly: { host: "buy.stripe.com", path: "/" },
  stripeManage: { host: "billing.stripe.com", path: "/p/login/" },
  githubSponsors: { host: "github.com", path: "/sponsors/" },
};
const MODE = {
  once: { key: "stripeOnce", label: "Donate once with Stripe", big: "Any amount helps." },
  monthly: { key: "stripeMonthly", label: "Donate monthly with Stripe", big: "A little, every month." },
};

function donateHref(data, key) {
  const rule = DONATE[key];
  const u = httpsUrl(data?.[key]);
  const ok = u && u.hostname === rule.host && !u.port && u.pathname.startsWith(rule.path) && u.pathname.length > rule.path.length;
  if (!ok && data?.[key]) console.warn(`support.json: skipped ${key}; it must be an https://${rule.host}${rule.path}… link.`);
  return ok ? u.href : null;
}

function showDonations(data) {
  const box = document.querySelector("[data-support]");
  if (!box) return;
  const hrefs = Object.fromEntries(Object.keys(DONATE).map((key) => [key, donateHref(data, key)]));
  const modes = Object.keys(MODE).filter((m) => hrefs[MODE[m].key]);
  if (!modes.length) return;
  const link = box.querySelector("[data-give-link]");
  const big = box.querySelector("[data-give-big]");
  const seg = box.querySelector("[data-give-mode]");
  const pick = (mode) => {
    link.href = hrefs[MODE[mode].key];
    link.textContent = MODE[mode].label;
    big.textContent = MODE[mode].big;
  };
  link.rel = "noopener";
  link.hidden = false;
  box.querySelector("[data-give-soon]").hidden = true;
  seg.hidden = modes.length < 2;
  seg.querySelector(`input[value="${modes[0]}"]`).checked = true;
  seg.addEventListener("change", (event) => pick(event.target.value));
  pick(modes[0]);
  const more = [];
  if (hrefs.stripeManage) more.push(["Manage a monthly donation", hrefs.stripeManage]);
  if (hrefs.githubSponsors) more.push(["Sponsor on GitHub", hrefs.githubSponsors]);
  if (more.length) {
    const holder = box.querySelector("[data-give-more]");
    holder.replaceChildren(...more.map(([label, href]) => Object.assign(el("a", "", label), { href, rel: "noopener" })));
    holder.hidden = false;
  }
}

/* ---------- Supporters wall: /assets/supporters.json, [{ "name": "…", "url": "https://…" (optional) }]
   Only people who opted in. Empty shows an honest empty state. */

const validSupporter = (s) =>
  Boolean(s) && typeof s === "object" && isText(s.name, 80) && (s.url === undefined || httpsUrl(s.url) !== null);

function showSupporters(data) {
  const list = document.querySelector("[data-supporters-list]");
  if (!list || !Array.isArray(data)) return;
  const people = data.filter(validSupporter).slice(0, 500);
  if (people.length !== data.length) console.warn("Some entries in supporters.json were skipped as invalid.");
  if (!people.length) return;
  list.replaceChildren(
    ...people.map((s) => {
      const li = el("li");
      if (s.url === undefined) li.textContent = s.name.trim();
      else li.append(Object.assign(el("a", "", s.name.trim()), { href: httpsUrl(s.url).href, rel: "nofollow noopener" }));
      return li;
    }),
  );
  document.querySelector("[data-supporters-empty]")?.setAttribute("hidden", "");
}

/* ---------- Quotes: /assets/quotes.json, [{ quote, name, handle, avatar?, source? }]
   Real, attributable quotes only. Empty keeps the section hidden. */

function validQuote(q) {
  if (!q || typeof q !== "object") return false;
  if (!isText(q.quote, 600) || !isText(q.name, 80) || !isText(q.handle, 80)) return false;
  if (q.avatar !== undefined && !(isText(q.avatar, 200) && /^\/assets\/[\w./-]+$/.test(q.avatar) && !q.avatar.includes(".."))) return false;
  return q.source === undefined || httpsUrl(q.source) !== null;
}

function renderQuote(q) {
  const fig = el("figure", "quote");
  const bq = el("blockquote");
  bq.append(el("p", "", q.quote));
  const cap = el("figcaption", "", `${q.name} · ${q.handle}`);
  if (q.source) cap.append(" · ", Object.assign(el("a", "", "Source"), { href: httpsUrl(q.source).href, rel: "noopener nofollow" }));
  fig.append(bq, cap);
  const li = el("li");
  li.append(fig);
  return li;
}

function showQuotes(data) {
  const section = document.querySelector("[data-quotes]");
  if (!section || !Array.isArray(data)) return;
  const quotes = data.filter(validQuote).slice(0, 9);
  if (!quotes.length) return;
  section.querySelector("[data-quotes-list]").replaceChildren(...quotes.map(renderQuote));
  section.hidden = false;
}

async function initData() {
  const loaders = [
    ["/assets/support.json", showDonations],
    ["/assets/supporters.json", showSupporters],
    ["/assets/quotes.json", showQuotes],
  ];
  // allSettled: one broken file must not take the others down.
  const results = await Promise.allSettled(loaders.map(([path]) => getJson(path)));
  results.forEach((r, i) => {
    if (r.status === "fulfilled") loaders[i][1](r.value);
    else console.warn("Carbon home data skipped:", r.reason);
  });
}

for (const init of [initParallax, initLyrics, initBento, initData]) {
  try {
    init();
  } catch (err) {
    console.error("Carbon home failed:", err);
  }
}
