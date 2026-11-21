import { describe, expect, it } from "vitest";
import { canBendBackdrop, pillMap } from "./liquid-glass";

const at = (map: Uint8ClampedArray, w: number, x: number, y: number) => [map[(y * w + x) * 4], map[(y * w + x) * 4 + 1]];

describe("pillMap", () => {
  const w = 200;
  const h = 40;
  const map = pillMap(w, h, 10);

  it("leaves the middle untouched", () => {
    const [r, g] = at(map, w, 100, 20);
    expect(Math.abs(r - 128)).toBeLessThanOrEqual(1);
    expect(Math.abs(g - 128)).toBeLessThanOrEqual(1);
  });

  it("bends the rim inward: down at the top edge, up at the bottom", () => {
    expect(at(map, w, 100, 0)[1]).toBeGreaterThan(200);
    expect(at(map, w, 100, h - 1)[1]).toBeLessThan(56);
  });

  it("bends the round ends sideways", () => {
    expect(at(map, w, 0, 20)[0]).toBeGreaterThan(200);
    expect(at(map, w, w - 1, 20)[0]).toBeLessThan(56);
  });

  it("is fully opaque, so the filter reads every pixel", () => {
    expect(map[3]).toBe(255);
    expect(map.length).toBe(w * h * 4);
  });
});

describe("canBendBackdrop", () => {
  it("is true for WebView2 and false for WebKit", () => {
    expect(canBendBackdrop("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0")).toBe(true);
    expect(canBendBackdrop("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)")).toBe(false);
  });
});
