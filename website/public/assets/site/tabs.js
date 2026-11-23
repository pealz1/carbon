/*
  Tabs (WAI-ARIA tabs pattern) for [data-tabs]: buttons [role="tab"] with aria-controls naming a
  [role="tabpanel"]. The panel id doubles as the URL hash, so /switch#cider opens that tab and the
  footer can link straight to it. Arrow keys, Home and End move between tabs.
*/
function initTabs(root) {
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const panelOf = (tab) => document.getElementById(tab.getAttribute("aria-controls"));

  function select(tab, { focus = false, updateHash = true } = {}) {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = panelOf(t);
      panel.hidden = !on;
      if (on) {
        panel.classList.remove("is-entering");
        void panel.offsetWidth;
        panel.classList.add("is-entering");
      }
    }
    if (focus) tab.focus();
    if (updateHash) history.replaceState(null, "", `#${tab.getAttribute("aria-controls")}`);
  }

  root.addEventListener("click", (event) => {
    const tab = event.target.closest('[role="tab"]');
    if (tab) select(tab);
  });
  root.addEventListener("keydown", (event) => {
    const index = tabs.indexOf(document.activeElement);
    if (index === -1) return;
    const moves = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    select(tabs.at(moves[event.key] % tabs.length), { focus: true });
  });

  const fromHash = () => {
    const tab = tabs.find((t) => `#${t.getAttribute("aria-controls")}` === window.location.hash);
    if (tab) {
      select(tab, { updateHash: false });
      root.scrollIntoView({ block: "start" });
    }
  };
  window.addEventListener("hashchange", fromHash);
  if (window.location.hash) fromHash();
  else select(tabs.find((t) => t.getAttribute("aria-selected") === "true") ?? tabs[0], { updateHash: false });
}

document.querySelectorAll("[data-tabs]").forEach(initTabs);
