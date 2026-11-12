import { describe, expect, it } from "vitest";
import { comboFrom, comboKeys, sameShortcut, type KeyPress } from "./hotkeys";

const press = (code: string, mods: Partial<KeyPress> = {}): KeyPress => ({ code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });

describe("recording a global shortcut", () => {
  it("writes modifiers in a fixed order before the physical key", () => {
    expect(comboFrom(press("Space", { ctrlKey: true, altKey: true }))).toBe("Ctrl+Alt+Space");
    expect(comboFrom(press("KeyM", { altKey: true, ctrlKey: true, shiftKey: true }))).toBe("Ctrl+Alt+Shift+M");
    expect(comboFrom(press("ArrowRight", { metaKey: true }))).toBe("Super+Right");
    expect(comboFrom(press("Digit7", { ctrlKey: true }))).toBe("Ctrl+7");
    expect(comboFrom(press("Numpad4", { altKey: true }))).toBe("Alt+Num4");
  });

  it("waits while only modifiers are held", () => {
    expect(comboFrom(press("ControlLeft", { ctrlKey: true }))).toBeNull();
    expect(comboFrom(press("AltRight", { altKey: true, ctrlKey: true }))).toBeNull();
  });

  it("refuses keys that would stop typing everywhere", () => {
    expect(comboFrom(press("KeyK"))).toBeNull();
    expect(comboFrom(press("KeyK", { shiftKey: true }))).toBeNull();
    expect(comboFrom(press("F5"))).toBeNull();
    expect(comboFrom(press("F19"))).toBe("F19");
    expect(comboFrom(press("IntlBackslash", { ctrlKey: true }))).toBeNull();
  });

  it("shows bindings as keycaps", () => {
    expect(comboKeys("Ctrl+Alt+Right")).toEqual(["Ctrl", "Alt", "→"]);
    expect(comboKeys("Super+Shift+P")).toEqual(["Win", "Shift", "P"]);
    expect(comboKeys("")).toEqual([]);
  });

  it("knows a shortcut however it was written", () => {
    expect(sameShortcut("Ctrl+Alt+Space", "Alt+Control+space")).toBe(true);
    expect(sameShortcut("Ctrl+Alt+Space", "Ctrl+Space")).toBe(false);
    expect(sameShortcut("", "")).toBe(false);
  });
});
