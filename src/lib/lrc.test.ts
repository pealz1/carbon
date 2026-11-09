import { describe, expect, it } from "vitest";
import { activeLineIndex, parseLrc } from "./lrc";

describe("parseLrc", () => {
  it("parses timestamps, skips metadata and sorts", () => {
    const lrc = "[ar:Radiohead]\n[00:12.50] second\n[00:01.00] first\nplain text\n[01:02.345]third";
    expect(parseLrc(lrc)).toEqual([
      { timeMs: 1000, text: "first" },
      { timeMs: 12500, text: "second" },
      { timeMs: 62345, text: "third" },
    ]);
  });

  it("expands lines with several timestamps and keeps empty lines as breaks", () => {
    expect(parseLrc("[00:05.00][00:30.00]chorus\r\n[00:10.00]")).toEqual([
      { timeMs: 5000, text: "chorus" },
      { timeMs: 10000, text: "" },
      { timeMs: 30000, text: "chorus" },
    ]);
  });

  it("returns nothing for empty input", () => {
    expect(parseLrc("")).toEqual([]);
  });
});

describe("activeLineIndex", () => {
  const lines = parseLrc("[00:01.00]a\n[00:05.00]b\n[00:09.00]c");

  it("finds the current line", () => {
    expect(activeLineIndex(lines, 0)).toBe(-1);
    expect(activeLineIndex(lines, 1000)).toBe(0);
    expect(activeLineIndex(lines, 7000)).toBe(1);
    expect(activeLineIndex(lines, 99_000)).toBe(2);
  });

  it("handles no lines", () => {
    expect(activeLineIndex([], 5000)).toBe(-1);
  });
});
