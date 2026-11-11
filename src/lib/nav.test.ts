import { describe, expect, it } from "vitest";
import { isActive, sectionsFor } from "./nav";

describe("sidebar sections", () => {
  it("shows one section per connected service, and the PC's always", () => {
    const ids = (spotify: boolean, youtube: boolean) => sectionsFor({ spotify, youtube }).map((s) => s.id);
    expect(ids(true, false)).toEqual(["spotify", "pc"]);
    expect(ids(false, true)).toEqual(["youtube", "pc"]);
    expect(ids(true, true)).toEqual(["spotify", "youtube", "pc"]);
  });

  it("lights a section's home only on that page", () => {
    expect(isActive("/youtube", "/youtube")).toBe(true);
    expect(isActive("/youtube", "/youtube/search")).toBe(false);
    expect(isActive("/youtube/library", "/youtube/library")).toBe(true);
    expect(isActive("/", "/youtube")).toBe(false);
    expect(isActive("/library", "/library/x")).toBe(true);
  });
});
