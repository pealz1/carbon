import { describe, expect, it } from "vitest";
import { fitsOnScreen, parseRect } from "./geometry";

const screens = [
  { position: { x: 0, y: 0 }, size: { width: 1920, height: 1080 } },
  { position: { x: 1920, y: 0 }, size: { width: 1280, height: 1024 } },
];

describe("mini player geometry", () => {
  it("puts a window back only where a screen still shows enough of it", () => {
    expect(fitsOnScreen({ x: 100, y: 100, width: 400, height: 400 }, screens)).toBe(true);
    expect(fitsOnScreen({ x: 2500, y: 600, width: 400, height: 400 }, screens)).toBe(true);
    expect(fitsOnScreen({ x: 3300, y: 100, width: 400, height: 400 }, screens)).toBe(false);
    expect(fitsOnScreen({ x: 3170, y: 100, width: 400, height: 400 }, screens)).toBe(false);
    expect(fitsOnScreen({ x: 100, y: -380, width: 400, height: 400 }, screens)).toBe(false);
    expect(fitsOnScreen({ x: 100, y: 100, width: 400, height: 400 }, [])).toBe(false);
  });

  it("reads back only a complete saved rect", () => {
    expect(parseRect('{"x":-10,"y":20,"width":400,"height":380}')).toEqual({ x: -10, y: 20, width: 400, height: 380 });
    expect(parseRect(null)).toBeNull();
    expect(parseRect("not json")).toBeNull();
    expect(parseRect('{"x":1,"y":2,"width":0,"height":3}')).toBeNull();
    expect(parseRect('{"x":1,"y":2,"width":"400","height":3}')).toBeNull();
  });
});
