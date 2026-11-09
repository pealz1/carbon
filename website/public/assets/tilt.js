/*
  Shared pointer interactions.
  [data-tilt="N"]   tilts up to N degrees toward the pointer; sets --rx/--ry and the
                    specular position --sx/--sy (px, used by a child moved with transform).
  [data-hold-root]  press-and-hold: a .tile__trigger inside opens the detail after HOLD_MS.
                    Keyboard Enter/Space toggles it; Escape closes it.
*/
(() => {
  "use strict";

  const HOLD_MS = 500;
  const HINT_MS = 700;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");

  function initTilt(el) {
    const max = Number.parseFloat(el.dataset.tilt) || 6;
    let frame = 0;
    let cx = 0;
    let cy = 0;

    const apply = () => {
      frame = 0;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const x = (cx - r.left) / r.width;
      const y = (cy - r.top) / r.height;
      el.style.setProperty("--rx", `${((0.5 - y) * max).toFixed(2)}deg`);
      el.style.setProperty("--ry", `${((x - 0.5) * max).toFixed(2)}deg`);
      el.style.setProperty("--sx", `${(cx - r.left).toFixed(1)}px`);
      el.style.setProperty("--sy", `${(cy - r.top).toFixed(1)}px`);
    };

    el.addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch" || reduce.matches || !finePointer.matches) return;
      cx = e.clientX;
      cy = e.clientY;
      el.classList.add("is-lit");
      if (!frame) frame = requestAnimationFrame(apply);
    });

    el.addEventListener("pointerleave", () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      el.classList.remove("is-lit");
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
    });
  }

  function initHold(root) {
    const trigger = root.querySelector(".tile__trigger");
    if (!trigger) return;
    let timer = 0;
    let hintTimer = 0;
    let openedByHold = false;

    const setOpen = (open) => {
      root.classList.toggle("is-held", open);
      trigger.setAttribute("aria-expanded", String(open));
    };

    const release = () => {
      clearTimeout(timer);
      root.classList.remove("is-pressed", "is-holding");
    };

    trigger.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      openedByHold = false;
      root.classList.add("is-pressed");
      if (root.classList.contains("is-held")) return;
      root.classList.add("is-holding");
      timer = setTimeout(() => {
        openedByHold = true;
        root.classList.remove("is-holding");
        setOpen(true);
      }, HOLD_MS);
    });

    for (const type of ["pointerup", "pointercancel", "pointerleave"]) {
      trigger.addEventListener(type, release);
    }

    // A long press on touch screens would otherwise open the context menu.
    trigger.addEventListener("contextmenu", (e) => e.preventDefault());

    trigger.addEventListener("click", (e) => {
      if (openedByHold) {
        openedByHold = false;
        return;
      }
      const isOpen = root.classList.contains("is-held");
      // detail === 0 means keyboard activation: toggle directly.
      if (e.detail === 0 || isOpen) {
        setOpen(!isOpen);
        return;
      }
      root.classList.add("is-hinting");
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => root.classList.remove("is-hinting"), HINT_MS);
    });

    trigger.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && root.classList.contains("is-held")) setOpen(false);
    });
  }

  document.querySelectorAll("[data-tilt]").forEach(initTilt);
  document.querySelectorAll("[data-hold-root]").forEach(initHold);
})();
