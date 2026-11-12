// Global shortcuts in Settings: turning a key press into an accelerator the Rust core can register,
// and showing one. hotkeys.rs checks every binding again before using it.
import type { HotkeyAction, Hotkeys } from "$lib/native";

export const HOTKEY_ACTIONS: { action: HotkeyAction; label: string }[] = [
  { action: "playPause", label: "Play or pause" },
  { action: "next", label: "Next song" },
  { action: "previous", label: "Previous song" },
  { action: "miniPlayer", label: "Mini player" },
  { action: "abLoop", label: "Loop part of the song" },
  { action: "sleepTimer", label: "Sleep timer (30 minutes, or off)" },
];

/** The suggested bindings (hotkeys.rs has the same); the loop and sleep timer start unbound. */
export const DEFAULT_BINDINGS: Omit<Hotkeys, "enabled"> = {
  playPause: "Ctrl+Alt+Space",
  next: "Ctrl+Alt+Right",
  previous: "Ctrl+Alt+Left",
  miniPlayer: "Ctrl+Alt+M",
  abLoop: "",
  sleepTimer: "",
};

const MODIFIERS = ["Ctrl", "Alt", "Shift", "Super"];

const NAMED: Record<string, string> = {
  ArrowLeft: "Left",
  ArrowRight: "Right",
  ArrowUp: "Up",
  ArrowDown: "Down",
  Space: "Space",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Insert: "Insert",
  Delete: "Delete",
  Backquote: "Backquote",
  Minus: "Minus",
  Equal: "Equal",
  BracketLeft: "BracketLeft",
  BracketRight: "BracketRight",
  Backslash: "Backslash",
  Semicolon: "Semicolon",
  Quote: "Quote",
  Comma: "Comma",
  Period: "Period",
  Slash: "Slash",
};

/** Keys nothing types, so they may stand alone. */
const LONE = /^F(1[3-9]|2[0-4])$/;

export interface KeyPress {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

/** By physical key (`code`), so a binding means the same key on every keyboard layout. */
function keyName(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return `Num${code.slice(6)}`;
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  return NAMED[code] ?? null;
}

/**
 * The accelerator for a key press ("Ctrl+Alt+Space"), or null while only modifiers are held or the
 * key would get in the way of typing everywhere (it needs Ctrl, Alt or Windows; Shift isn't enough).
 */
export function comboFrom(press: KeyPress): string | null {
  const key = keyName(press.code);
  if (!key) return null;
  if (!press.ctrlKey && !press.altKey && !press.metaKey && !LONE.test(key)) return null;
  const held = [press.ctrlKey, press.altKey, press.shiftKey, press.metaKey];
  return [...MODIFIERS.filter((_, i) => held[i]), key].join("+");
}

/** Same shortcut, same text, whatever order the modifiers were written in. */
function canonical(combo: string): string {
  const parts = combo.split("+").map((p) => p.trim());
  const key = parts.at(-1) ?? "";
  const mods = parts.slice(0, -1).map((m) => (m.toLowerCase() === "control" ? "ctrl" : m.toLowerCase()));
  return [...MODIFIERS.filter((m) => mods.includes(m.toLowerCase())), key.toLowerCase()].join("+");
}

/** Whether two bindings are the same shortcut. */
export const sameShortcut = (a: string, b: string): boolean => !!a && !!b && canonical(a) === canonical(b);

const SHOWN: Record<string, string> = { Super: "Win", Left: "←", Right: "→", Up: "↑", Down: "↓" };

/** "Ctrl+Alt+Right" as keycaps: ["Ctrl", "Alt", "→"]. */
export const comboKeys = (combo: string): string[] => (combo ? combo.split("+").map((k) => SHOWN[k] ?? k) : []);
