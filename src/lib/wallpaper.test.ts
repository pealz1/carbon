import { describe, expect, it } from "vitest";
import type { Rgb } from "./palette";
import { atLuminance, ceiling, contrast, GRAPHITE, INK, luminance, PAPER, tonesFrom } from "./wallpaper";

const blend = (fg: Rgb, alpha: number, bg: Rgb): Rgb => fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha))) as Rgb;
const WHITE: Rgb = [255, 255, 255];
/** Chrome secondary text: white at this alpha (app.css --chrome-text-muted). */
const MUTED_ALPHA = 0.62;

const PALETTES: Record<string, Rgb[]> = {
  "near-black": [[6, 5, 4]],
  "saturated red": [[230, 20, 20], [120, 0, 0]],
  "near-white": [[250, 250, 248], [235, 236, 240]],
  "brand yellow": [[250, 233, 29]],
  "electric blue": [[0, 90, 255], [140, 200, 255], [10, 10, 40]],
  empty: [],
};

describe("tonesFrom", () => {
  for (const [name, palette] of Object.entries(PALETTES)) {
    it(`keeps chrome text readable on ${name} artwork`, () => {
      const { fields } = tonesFrom(palette);
      const top = ceiling(fields);
      expect(contrast(PAPER, top)).toBeGreaterThanOrEqual(7);
      expect(contrast(blend(WHITE, MUTED_ALPHA, top), top)).toBeGreaterThanOrEqual(4.5);
    });

    it(`gives ${name} artwork a Play pill Ink reads on`, () => {
      const { pill, wash } = tonesFrom(palette);
      expect(contrast(INK, pill)).toBeGreaterThanOrEqual(7);
      expect(contrast(PAPER, wash)).toBeGreaterThanOrEqual(7);
    });
  }

  it("always returns four fields, repeating a short palette", () => {
    expect(tonesFrom([[200, 40, 10]]).fields).toHaveLength(4);
    expect(tonesFrom([]).fields).toHaveLength(4);
  });

  it("falls back to graphite without artwork", () => {
    const [field] = tonesFrom([]).fields;
    const [r, g, b] = field;
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(8);
    expect(tonesFrom([]).pill).toEqual(tonesFrom([GRAPHITE]).pill);
  });

  it("keeps the artwork's hue in the wash", () => {
    const [r, g, b] = tonesFrom([[220, 110, 40]]).fields[0];
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });
});

describe("atLuminance", () => {
  it("lands on the requested luminance", () => {
    expect(luminance(atLuminance([230, 20, 20], 0.03))).toBeCloseTo(0.03, 2);
    expect(luminance(atLuminance([20, 20, 230], 0.42))).toBeCloseTo(0.42, 2);
  });

  it("leaves greys grey", () => {
    const [r, g, b] = atLuminance([128, 128, 128], 0.2);
    expect(r).toBe(g);
    expect(g).toBe(b);
  });
});
