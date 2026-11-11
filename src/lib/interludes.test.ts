import { describe, expect, it } from "vitest";
import { dotFills, withInterludes } from "$lib/interludes";
import type { LyricLine } from "$lib/lrc";

const line = (timeMs: number, text = "placeholder line"): LyricLine => ({ timeMs, text });

describe("withInterludes", () => {
  it("adds a break before a late first line only", () => {
    expect(withInterludes([line(12_000)])[0]).toEqual({ timeMs: 0, text: "", interludeEndMs: 12_000 });
    expect(withInterludes([line(2_000)])).toEqual([line(2_000)]);
    expect(withInterludes([])).toEqual([]);
  });

  it("starts a break when the last timed word ends", () => {
    const sung: LyricLine = {
      timeMs: 1_000,
      text: "one two",
      words: [
        { text: "one ", startMs: 1_000, endMs: 1_500 },
        { text: "two", startMs: 1_500, endMs: 3_000 },
      ],
    };
    const shown = withInterludes([sung, line(10_000)]);
    expect(shown.map((l) => l.timeMs)).toEqual([1_000, 3_000, 10_000]);
    expect(shown[1].interludeEndMs).toBe(10_000);
  });

  it("assumes a line without word timing is sung for a while", () => {
    expect(withInterludes([line(1_000), line(10_000)])).toHaveLength(2);
    const shown = withInterludes([line(1_000), line(30_000)]);
    expect(shown[1]).toEqual({ timeMs: 9_000, text: "", interludeEndMs: 30_000 });
  });

  it("fills long empty lines in place and leaves short ones alone", () => {
    const shown = withInterludes([line(1_000), line(3_000, ""), line(5_000), line(6_000, ""), line(26_000)]);
    expect(shown).toEqual([line(1_000), line(3_000, ""), line(5_000), { ...line(6_000, ""), interludeEndMs: 26_000 }, line(26_000)]);
  });

  it("adds nothing after the last line", () => {
    expect(withInterludes([line(1_000), line(2_000)])).toHaveLength(2);
  });
});

describe("dotFills", () => {
  it("fills the dots one after another over the break", () => {
    expect(dotFills(0, 3_000, -500, false)).toEqual([0, 0, 0]);
    expect(dotFills(0, 3_000, 1_500, false)).toEqual([1, 0.5, 0]);
    expect(dotFills(0, 3_000, 9_000, false)).toEqual([1, 1, 1]);
  });

  it("lights whole dots when stepped", () => {
    expect(dotFills(0, 3_000, 1_500, true)).toEqual([1, 0, 0]);
    expect(dotFills(0, 3_000, 2_999, true)).toEqual([1, 1, 0]);
  });

  it("treats an empty break as done", () => {
    expect(dotFills(5_000, 5_000, 0, false)).toEqual([1, 1, 1]);
  });
});
