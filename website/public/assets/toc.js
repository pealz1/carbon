/* Table of contents: marks the section in view and collapses on narrow screens. */
(() => {
  "use strict";

  const toc = document.querySelector("[data-toc]");
  if (!toc) return;

  const narrow = window.matchMedia("(max-width: 900px)");
  const sync = () => { toc.open = !narrow.matches; };
  sync();
  narrow.addEventListener("change", sync);

  // On desktop the list is always shown, so the summary must not collapse it.
  toc.querySelector("summary")?.addEventListener("click", (e) => {
    if (!narrow.matches) e.preventDefault();
  });

  const links = new Map();
  toc.querySelectorAll('a[href^="#"]').forEach((a) => {
    const target = document.getElementById(a.getAttribute("href").slice(1));
    if (target) links.set(target, a);
  });

  const visible = new Set();
  const mark = () => {
    const first = [...links.keys()].find((s) => visible.has(s));
    links.forEach((a, s) => {
      if (s === first) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
  };

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)));
    mark();
  }, { rootMargin: "-90px 0px -55% 0px" });

  links.forEach((_, section) => io.observe(section));

  toc.addEventListener("click", (e) => {
    if (e.target.closest("a") && narrow.matches) toc.open = false;
  });
})();
