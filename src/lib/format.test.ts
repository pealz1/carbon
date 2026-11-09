import { describe, expect, it } from "vitest";
import { formatDuration, formatTotal, greeting, joinNames } from "./format";

describe("format", () => {
  it("formats track durations", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(229_000)).toBe("3:49");
    expect(formatDuration(3_725_000)).toBe("1:02:05");
    expect(formatDuration(-5)).toBe("0:00");
  });

  it("formats totals", () => {
    expect(formatTotal(45 * 60_000)).toBe("45 min");
    expect(formatTotal(125 * 60_000)).toBe("2 hr 5 min");
  });

  it("joins names", () => {
    expect(joinNames([{ name: "A" }, { name: "B" }])).toBe("A, B");
    expect(joinNames([])).toBe("");
  });

  it("greets by time of day", () => {
    expect(greeting(new Date(2026, 0, 1, 3))).toBe("Late night");
    expect(greeting(new Date(2026, 0, 1, 9))).toBe("Good morning");
    expect(greeting(new Date(2026, 0, 1, 14))).toBe("Good afternoon");
    expect(greeting(new Date(2026, 0, 1, 21))).toBe("Good evening");
  });
});
