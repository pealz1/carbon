import { describe, expect, it } from "vitest";
import { lineEnd, timeWords, wordProgress } from "./words";

describe("timeWords", () => {
  it("splits a line's sung time across words by length, in order", () => {
    const words = timeWords("a heart that's full", 10_000, 14_000);
    expect(words.map((w) => w.text)).toEqual(["a", "heart", "that's", "full"]);
    expect(words[0].startMs).toBe(10_000);
    for (let i = 1; i < words.length; i++) expect(words[i].startMs).toBeGreaterThan(words[i - 1].startMs);
    const last = words.at(-1)!;
    expect(last.startMs + last.durationMs).toBeLessThanOrEqual(14_000 * 0.85 + 10_000 * 0.15 + 1);
    expect(words[1].durationMs).toBeGreaterThan(words[0].durationMs);
  });

  it("handles empty lines and tiny gaps", () => {
    expect(timeWords("   ", 0, 1000)).toEqual([]);
    const squeezed = timeWords("one two three", 0, 10);
    expect(squeezed.every((w) => w.durationMs >= 60)).toBe(true);
  });
});

describe("lineEnd", () => {
  it("uses the next line's start, or a default for the last line", () => {
    const lines = [
      { timeMs: 1000, text: "a" },
      { timeMs: 5000, text: "b" },
    ];
    expect(lineEnd(lines, 0)).toBe(5000);
    expect(lineEnd(lines, 1)).toBe(9000);
  });
});

describe("wordProgress", () => {
  const word = { text: "x", startMs: 1000, durationMs: 500 };
  it("clamps between 0 and 1", () => {
    expect(wordProgress(word, 0)).toBe(0);
    expect(wordProgress(word, 1250)).toBe(0.5);
    expect(wordProgress(word, 9999)).toBe(1);
  });
});
