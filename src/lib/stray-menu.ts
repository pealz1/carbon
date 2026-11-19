// The webview shows the browser's own menu (Back, Refresh, Save as, Print) wherever Carbon has no
// menu of its own. Carbon's menus call preventDefault, so this only sees right-clicks nobody handled.
import { copyText } from "$lib/clipboard";
import { menu } from "$lib/menu.svelte";

const TEXT_INPUTS = new Set(["text", "search", "url", "email", "password", "number", "tel", ""]);

/** Text fields keep the native menu: paste and spellcheck live there. */
function isEditable(el: Element): boolean {
  if (el.closest("textarea, [contenteditable]:not([contenteditable='false'])")) return true;
  const input = el.closest("input");
  return !!input && TEXT_INPUTS.has(input.getAttribute("type")?.toLowerCase() ?? "");
}

export function handleStrayContextMenu(event: MouseEvent): void {
  if (event.defaultPrevented) return;
  const target = event.target instanceof Element ? event.target : null;
  if (target && isEditable(target)) return;
  event.preventDefault();
  const text = window.getSelection()?.toString().trim();
  if (!text) return;
  // The Menu key and Shift+F10 report (0, 0): open under the element instead.
  const rect = target?.getBoundingClientRect();
  const fromPointer = event.clientX || event.clientY;
  const x = fromPointer ? event.clientX : (rect?.left ?? 0);
  const y = fromPointer ? event.clientY : (rect?.bottom ?? 0);
  menu.openAt(x, y, [{ label: "Copy", icon: "duplicate", action: () => copyText(text) }]);
}

export function suppressBrowserMenu(target: Window): () => void {
  target.addEventListener("contextmenu", handleStrayContextMenu);
  return () => target.removeEventListener("contextmenu", handleStrayContextMenu);
}
