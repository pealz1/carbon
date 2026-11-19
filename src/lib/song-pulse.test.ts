import { describe, expect, it } from "vitest";
import { bassLevel, breathSeconds, pace, smooth } from "./song-pulse";

describe("pace", () => {
  const base = { tempo: 110, energy: 0.5, volume: 1, playing: true };

  it("is near 1 for a mid-tempo song at full volume", () => {
    expect(pace(base)).toBeCloseTo(1, 1);
  });

  it("speeds up with tempo, energy and volume", () => {
    expect(pace({ ...base, tempo: 150 })).toBeGreaterThan(pace(base));
    expect(pace({ ...base, energy: 0.9 })).toBeGreaterThan(pace(base));
    expect(pace({ ...base, volume: 0.2 })).toBeLessThan(pace(base));
  });

  it("folds half- and double-time readings", () => {
    expect(pace({ ...base, tempo: 220 })).toBeCloseTo(pace(base), 5);
    expect(pace({ ...base, tempo: 55 })).toBeCloseTo(pace(base), 5);
  });

  it("idles when paused and stays in range on odd input", () => {
    expect(pace({ ...base, playing: false })).toBe(0.2);
    expect(pace({ tempo: Number.NaN, energy: null, volume: 5, playing: true })).toBeLessThanOrEqual(2.4);
    expect(pace({ tempo: 160, energy: 1, volume: 1, playing: true })).toBeLessThanOrEqual(2.4);
  });
});

describe("breathSeconds", () => {
  it("is one bar of four beats", () => {
    expect(breathSeconds(120)).toBe(2);
    expect(breathSeconds(null)).toBeCloseTo(240 / 110);
  });
});

describe("bassLevel and smooth", () => {
  it("averages the lowest bands", () => {
    expect(bassLevel([1, 1, 0, 0, 1, 1])).toBe(0.5);
    expect(bassLevel([])).toBe(0);
  });

  it("rises fast and falls slowly", () => {
    expect(smooth(0, 1)).toBeCloseTo(0.6);
    expect(smooth(1, 0)).toBeCloseTo(0.88);
  });
});
