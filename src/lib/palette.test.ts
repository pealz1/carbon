import { describe, expect, it } from "vitest";
import { dominantColors } from "./palette";

function image(colors: [number, number, number, number][]): Uint8ClampedArray {
  return new Uint8ClampedArray(colors.flatMap(([r, g, b, n]) => Array.from({ length: n }, () => [r, g, b, 255]).flat()));
}

describe("dominantColors", () => {
  it("prefers vivid colours over large grey or black areas", () => {
    const pixels = image([
      [10, 10, 10, 400], // black background
      [128, 128, 128, 300], // grey
      [220, 40, 60, 120], // red
      [40, 90, 220, 100], // blue
    ]);
    const [first, second] = dominantColors(pixels, 2);
    expect(first[0]).toBeGreaterThan(180); // red first
    expect(second[2]).toBeGreaterThan(180); // then blue
  });

  it("returns distinct colours and skips transparent pixels", () => {
    const pixels = new Uint8ClampedArray([255, 0, 0, 0, 0, 200, 0, 255, 0, 205, 0, 255]);
    const colors = dominantColors(pixels, 3);
    expect(colors).toHaveLength(1);
    expect(colors[0][1]).toBeGreaterThan(190);
  });
});
