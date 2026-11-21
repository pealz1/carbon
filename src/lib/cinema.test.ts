import { describe, expect, it } from "vitest";
import { endsAt, lineAt, queueEndsAt } from "./cinema";
import type { LyricLine } from "./lrc";

// Placeholder text only: no real lyrics in fixtures.
const lines: LyricLine[] = [
  { timeMs: 10_000, text: "first line" },
  { timeMs: 13_000, text: "second line" },
  { timeMs: 16_000, text: "" },
  { timeMs: 30_000, text: "after a break" },
  { timeMs: 33_000, text: "next" },
  { timeMs: 41_000, text: "after a long gap" },
  { timeMs: 43_000, text: "last" },
];

describe("lineAt", () => {
  it("finds the line sung at a track time, shifted like the lyrics view", () => {
    expect(lineAt(lines, 9_000, 0)).toBeNull();
    expect(lineAt(lines, 10_000, 0)?.text).toBe("first line");
    expect(lineAt(lines, 12_999, 0)?.text).toBe("first line");
    expect(lineAt(lines, 9_000, 1_000)?.text).toBe("first line");
    expect(lineAt(lines, 20_000, 0)?.text).toBe("");
    expect(lineAt(lines, 999_999, 0)?.text).toBe("last");
  });

  it("returns nothing without lines", () => {
    expect(lineAt([], 5_000, 0)).toBeNull();
  });
});

describe("endsAt", () => {
  it("adds what is left of the song to now", () => {
    expect(endsAt(1_000_000, 60_000, 200_000)).toBe(1_140_000);
  });

  it("never ends in the past", () => {
    expect(endsAt(1_000_000, 250_000, 200_000)).toBe(1_000_000);
  });

  it("adds every queued song for the queue end", () => {
    const upNext = [{ durationMs: 180_000 }, { durationMs: 240_000 }];
    expect(queueEndsAt(1_000_000, 60_000, 200_000, upNext)).toBe(1_000_000 + 140_000 + 420_000);
    expect(queueEndsAt(1_000_000, 60_000, 200_000, [])).toBe(1_140_000);
  });

  it("skips songs with an unknown length", () => {
    expect(queueEndsAt(0, 0, 1_000, [{ durationMs: Number.NaN }, { durationMs: -5 }, { durationMs: 2_000 }])).toBe(3_000);
  });
});
