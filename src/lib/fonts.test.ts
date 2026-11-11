// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { applyFonts, cssString, fontStack, matchFonts } from "./fonts";

const none = { fontText: "", fontDisplay: "", fontLyrics: "" };

describe("applyFonts", () => {
  it("puts each chosen family ahead of Carbon's own stack", () => {
    const root = document.createElement("div");
    applyFonts(root, { fontText: "Bahnschrift", fontDisplay: "Segoe UI", fontLyrics: "Georgia" });
    expect(root.style.getPropertyValue("--font-text")).toBe('"Bahnschrift", var(--font-text-default)');
    expect(root.style.getPropertyValue("--font-display")).toBe('"Segoe UI", var(--font-display-default)');
    expect(root.style.getPropertyValue("--font-lyrics")).toBe('"Georgia", var(--font-display-default)');
  });

  it("drops the override for Default so app.css applies", () => {
    const root = document.createElement("div");
    applyFonts(root, { ...none, fontLyrics: "Georgia" });
    applyFonts(root, none);
    expect(root.getAttribute("style") ?? "").not.toMatch(/--font-/);
  });

  it("keeps a hostile name inside its CSS string", () => {
    expect(cssString('Arial"; } body { display: none; } /*')).toBe('"Arial\\"; } body { display: none; } /*"');
    expect(cssString("A\\B\nC")).toBe('"A\\\\B C"');
    const root = document.createElement("div");
    applyFonts(root, { ...none, fontText: 'Evil"; color: red' });
    expect(root.style.getPropertyValue("--font-text")).toBe(fontStack('Evil"; color: red', "var(--font-text-default)"));
    expect(root.style.getPropertyValue("color")).toBe("");
  });
});

describe("matchFonts", () => {
  const fonts = ["Arial", "Bahnschrift", "Segoe UI", "Segoe UI Emoji"];

  it("lists Default first, then every font", () => {
    expect(matchFonts(fonts, "")).toEqual(["", ...fonts]);
  });

  it("filters case-insensitively and keeps Default only when it matches", () => {
    expect(matchFonts(fonts, " segoe ")).toEqual(["Segoe UI", "Segoe UI Emoji"]);
    expect(matchFonts(fonts, "def")).toEqual([""]);
    expect(matchFonts(fonts, "zz")).toEqual([]);
  });
});
