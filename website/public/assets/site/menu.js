/*
  Menu buttons (WAI-ARIA menu button pattern): a button with aria-haspopup="menu" and
  aria-controls opens the .menu it names. Arrow keys, Home and End move between items,
  Escape closes and returns focus, Tab or a click outside closes.
*/
const ITEMS = '[role="menuitem"], [role="menuitemradio"]';

function bind(button) {
  const menu = document.getElementById(button.getAttribute("aria-controls"));
  if (!menu || button.dataset.menuBound) return;
  button.dataset.menuBound = "1";
  const items = () => [...menu.querySelectorAll(ITEMS)].filter((item) => !item.hidden);

  function outside(event) {
    if (!menu.contains(event.target) && !button.contains(event.target)) close(false);
  }

  function open(focusIndex = 0) {
    menu.classList.add("is-open");
    button.setAttribute("aria-expanded", "true");
    document.addEventListener("pointerdown", outside);
    const list = items();
    list.at(focusIndex)?.focus({ preventScroll: true });
  }

  function close(returnFocus) {
    if (!menu.classList.contains("is-open")) return;
    menu.classList.remove("is-open");
    button.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", outside);
    if (returnFocus) button.focus();
  }

  button.addEventListener("click", () => (menu.classList.contains("is-open") ? close(false) : open()));
  button.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      open(event.key === "ArrowDown" ? 0 : -1);
    }
  });
  menu.addEventListener("keydown", (event) => {
    const list = items();
    const index = list.indexOf(document.activeElement);
    const moves = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: list.length - 1 };
    if (event.key in moves) {
      event.preventDefault();
      list.at(moves[event.key] % list.length)?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") {
      close(false);
    }
  });
  menu.addEventListener("click", (event) => {
    if (event.target.closest(ITEMS)) close(false);
  });
}

export function initMenus(root = document) {
  root.querySelectorAll('[aria-haspopup="menu"][aria-controls]').forEach(bind);
}
