/* Home page: donation buttons and the Supporters wall, both driven by JSON so they change without a code edit. */
(() => {
  "use strict";

  const MAX_URL = 500;
  const MAX_NAME = 80;
  const MAX_SUPPORTERS = 500;

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
    // /assets/* is served as immutable, but these files change without a version bump.
    const res = await fetch(path, { cache: "no-cache", headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  /* ---------- Donation buttons ----------
     Source: /assets/support.json, an object:
       { "stripeOnce": "", "stripeMonthly": "", "githubSponsors": "" }
     stripeOnce takes a https://donate.stripe.com/… link, stripeMonthly a https://buy.stripe.com/… link,
     stripeManage the customer portal's https://billing.stripe.com/p/login/… link, and githubSponsors
     https://github.com/sponsors/….
     A button renders only for a set, valid URL. With none set, the Support section stays hidden
     and the FAQ answer keeps saying donations open soon.
  */

  const DONATE = [
    { key: "stripeOnce", label: "Donate once", host: "donate.stripe.com", path: "/" },
    { key: "stripeMonthly", label: "Donate monthly", host: "buy.stripe.com", path: "/" },
    { key: "githubSponsors", label: "Sponsor on GitHub", host: "github.com", path: "/sponsors/" },
    { key: "stripeManage", label: "Manage monthly support", host: "billing.stripe.com", path: "/p/login/" },
  ];

  function donateHref(value, { host, path }) {
    const u = httpsUrl(value);
    const ok = u && u.hostname === host && !u.port && u.pathname.startsWith(path) && u.pathname.length > path.length;
    return ok ? u.href : null;
  }

  function donateButton(label, href, primary) {
    const a = document.createElement("a");
    a.className = primary ? "btn btn--primary" : "btn btn--glass";
    a.href = href;
    a.rel = "noopener";
    a.textContent = label;
    return a;
  }

  function donateButtons(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("support.json must be an object");
    const buttons = [];
    for (const d of DONATE) {
      const href = donateHref(data[d.key], d);
      if (href) buttons.push(donateButton(d.label, href, buttons.length === 0));
      else if (data[d.key]) console.warn(`support.json: skipped ${d.key}; it must be an https://${d.host}${d.path}… link.`);
    }
    return buttons;
  }

  function showDonations(buttons) {
    const section = document.querySelector("[data-support]");
    const links = document.querySelector("[data-support-links]");
    const faq = document.querySelector("[data-support-faq]");
    if (!section || !links || !faq) return;
    const open = buttons.length > 0;
    if (open) {
      links.replaceChildren(...buttons);
      section.hidden = false;
    }
    faq.querySelector("[data-support-soon]").hidden = open;
    faq.querySelector("[data-support-open]").hidden = !open;

    // README, FUNDING.yml and the footer link to /#support; with no section to show, open the FAQ answer instead.
    const follow = () => {
      if (location.hash !== "#support") return;
      if (!open) faq.open = true;
      (open ? section : faq).scrollIntoView();
    };
    follow();
    window.addEventListener("hashchange", follow);
  }

  /* ---------- Supporters wall ----------
     Source: /assets/supporters.json, an array of:
       {
         "name": "string, required: shown exactly as the supporter asked",
         "url":  "string, optional: https:// link, rendered with rel=\"nofollow noopener\""
       }
     List only people who opted in. An empty array hides the wall entirely.
  */

  const validSupporter = (s) =>
    Boolean(s) && typeof s === "object" && isText(s.name, MAX_NAME) && (s.url === undefined || httpsUrl(s.url) !== null);

  function renderSupporter(s) {
    const li = document.createElement("li");
    if (s.url === undefined) {
      li.textContent = s.name.trim();
      return li;
    }
    const a = document.createElement("a");
    a.className = "link";
    a.href = httpsUrl(s.url).href;
    a.rel = "nofollow noopener";
    a.textContent = s.name.trim();
    li.append(a);
    return li;
  }

  function showSupporters(data) {
    const section = document.querySelector("[data-supporters]");
    const list = document.querySelector("[data-supporters-list]");
    if (!section || !list) return;
    if (!Array.isArray(data)) throw new Error("supporters.json must be an array");
    const people = data.filter(validSupporter).slice(0, MAX_SUPPORTERS);
    if (people.length !== data.length) console.warn("Some entries in supporters.json were skipped as invalid or over the limit.");
    if (!people.length) return;
    list.replaceChildren(...people.map(renderSupporter));
    section.hidden = false;
  }

  async function init() {
    // allSettled: a broken supporters file must not hide the donation buttons, or the other way round.
    const [support, supporters] = await Promise.allSettled([getJson("/assets/support.json"), getJson("/assets/supporters.json")]);

    let buttons = [];
    try {
      if (support.status === "rejected") throw support.reason;
      buttons = donateButtons(support.value);
    } catch (err) {
      console.warn("Donation links unavailable:", err);
    }
    showDonations(buttons);

    try {
      if (supporters.status === "rejected") throw supporters.reason;
      showSupporters(supporters.value);
    } catch (err) {
      console.warn("Supporters wall unavailable:", err);
    }
  }

  init();
})();
