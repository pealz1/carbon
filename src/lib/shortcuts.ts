// Keyboard shortcuts: one table, one matcher. The layout's single keydown handler runs them.
export type ShortcutAction =
  | "toggle-play"
  | "previous"
  | "next"
  | "volume-up"
  | "volume-down"
  | "like"
  | "palette"
  | "fullscreen"
  | "cinema"
  | "shortcuts"
  | "escape";

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey?: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** Shown in the "?" sheet, in this order. */
export const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["Space"], label: "Play or pause" },
  { keys: ["Ctrl", "←"], label: "Previous song" },
  { keys: ["Ctrl", "→"], label: "Next song" },
  { keys: ["Ctrl", "↑"], label: "Volume up" },
  { keys: ["Ctrl", "↓"], label: "Volume down" },
  { keys: ["Ctrl", "L"], label: "Like the current song" },
  { keys: ["Ctrl", "K"], label: "Search, go anywhere or run a command" },
  { keys: ["F11"], label: "Full screen" },
  { keys: ["Ctrl", "Shift", "C"], label: "Cinema mode" },
  { keys: ["Esc"], label: "Leave cinema mode" },
  { keys: ["?"], label: "Show these shortcuts" },
];

const WITH_CTRL: Record<string, ShortcutAction> = {
  ArrowLeft: "previous",
  ArrowRight: "next",
  ArrowUp: "volume-up",
  ArrowDown: "volume-down",
  l: "like",
  k: "palette",
};

export function matchShortcut(event: KeyLike): ShortcutAction | null {
  if (event.altKey) return null;
  const ctrl = event.ctrlKey || !!event.metaKey;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (key === "F11") return ctrl || event.shiftKey ? null : "fullscreen";
  if (ctrl) {
    if (event.shiftKey) return key === "c" ? "cinema" : null;
    return WITH_CTRL[key] ?? null;
  }
  if (key === " " && !event.shiftKey) return "toggle-play";
  if (key === "?") return "shortcuts";
  if (key === "Escape") return "escape";
  return null;
}

/** Text fields keep their own keys (Ctrl+arrows jump words there, Space types a space). */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit", "reset", "range"].includes(target.type);
}

/** Space already presses buttons, links and switches; don't also toggle playback. */
export function isActivatable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && !!target.closest("button, a, input, select, textarea, summary, [role='menuitem'], [contenteditable]");
}

export const VOLUME_STEP = 0.05;
