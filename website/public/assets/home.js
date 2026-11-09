/* Home page: laptop screen switcher, device parallax, community quotes. */
(() => {
  "use strict";

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");

  /* ---------- Laptop screen switcher ---------- */

  function initScreens() {
    const buttons = document.querySelectorAll("[data-show]");
    const shots = document.querySelectorAll("[data-shot]");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const name = btn.dataset.show;
        buttons.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
        shots.forEach((s) => s.classList.toggle("is-shown", s.dataset.shot === name));
      });
    });
  }

  /* ---------- Device parallax: layers drift with the pointer, by depth ---------- */

  function initParallax() {
    const stage = document.querySelector("[data-stage]");
    if (!stage) return;
    const layers = [...stage.querySelectorAll("[data-depth]")].map((el) => ({
      el,
      depth: Number.parseFloat(el.dataset.depth) || 1,
    }));
    const STRENGTH = 9; // px of travel per unit of depth
    let tx = 0, ty = 0, x = 0, y = 0, frame = 0;

    const step = () => {
      x += (tx - x) * 0.08;
      y += (ty - y) * 0.08;
      for (const { el, depth } of layers) {
        el.style.translate = `${(x * depth * STRENGTH).toFixed(2)}px ${(y * depth * STRENGTH * 0.6).toFixed(2)}px`;
      }
      frame = Math.abs(tx - x) + Math.abs(ty - y) > 0.002 ? requestAnimationFrame(step) : 0;
    };
    const kick = () => { if (!frame) frame = requestAnimationFrame(step); };

    window.addEventListener("pointermove", (e) => {
      if (reduce.matches || !finePointer.matches || e.pointerType === "touch") return;
      tx = (e.clientX / window.innerWidth) * 2 - 1;
      ty = (e.clientY / window.innerHeight) * 2 - 1;
      kick();
    }, { passive: true });

    document.addEventListener("pointerleave", () => { tx = 0; ty = 0; kick(); });
  }

  /* ---------- Community quotes ----------
     Source: /assets/quotes.json, an array of:
       {
         "quote":  "string, required: the person's exact words, with their permission",
         "name":   "string, required: display name",
         "handle": "string, required: e.g. @name",
         "avatar": "string, optional: same-origin path such as /assets/avatars/name.webp
                    (the CSP blocks other hosts and data: URIs)",
         "source": "string, optional: https:// link to the original post"
       }
     Only real, attributable quotes belong here. An empty array hides the section entirely.
  */

  const MAX_QUOTES = 9;
  const isText = (v, max) => typeof v === "string" && v.trim().length > 0 && v.length <= max;

  function validQuote(q) {
    if (!q || typeof q !== "object") return false;
    if (!isText(q.quote, 600) || !isText(q.name, 80) || !isText(q.handle, 80)) return false;
    if (q.avatar !== undefined && !(isText(q.avatar, 200) && /^\/assets\/[\w./-]+$/.test(q.avatar) && !q.avatar.includes(".."))) return false;
    if (q.source !== undefined && !(isText(q.source, 500) && /^https:\/\//.test(q.source))) return false;
    return true;
  }

  function renderQuote(q) {
    const li = document.createElement("li");
    const fig = document.createElement("figure");
    fig.className = "voice";
    const bq = document.createElement("blockquote");
    bq.textContent = q.quote;
    const cap = document.createElement("figcaption");
    if (q.avatar) {
      const img = document.createElement("img");
      img.src = q.avatar;
      img.alt = "";
      img.width = 36;
      img.height = 36;
      img.loading = "lazy";
      cap.append(img);
    }
    const who = document.createElement("span");
    const name = document.createElement("b");
    name.textContent = q.name;
    const handle = document.createElement("small");
    handle.textContent = q.handle;
    who.append(name, handle);
    cap.append(who);
    if (q.source) {
      const a = document.createElement("a");
      a.href = q.source;
      a.rel = "noopener nofollow";
      a.className = "link";
      a.textContent = "Source";
      cap.append(a);
    }
    fig.append(bq, cap);
    li.append(fig);
    return li;
  }

  async function initQuotes() {
    const section = document.querySelector("[data-quotes]");
    const list = document.querySelector("[data-quotes-list]");
    if (!section || !list) return;
    try {
      const res = await fetch("/assets/quotes.json", { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error("quotes.json must be an array");
      const quotes = data.filter(validQuote).slice(0, MAX_QUOTES);
      if (quotes.length !== data.length) console.warn("Some quotes in quotes.json were skipped as invalid.");
      if (!quotes.length) return;
      list.replaceChildren(...quotes.map(renderQuote));
      section.hidden = false;
    } catch (err) {
      console.warn("Community quotes unavailable:", err);
    }
  }

  initScreens();
  initParallax();
  initQuotes();
})();
