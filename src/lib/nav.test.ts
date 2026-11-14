import { describe, expect, it } from "vitest";
import { isActive, sectionsFor } from "./nav";

describe("sidebar sections", () => {
  it("shows one section per connected service, with radio and the PC's always", () => {
    const ids = (spotify: boolean, youtube: boolean) => sectionsFor({ spotify, youtube }).map((s) => s.id);
    expect(ids(true, false)).toEqual(["spotify", "radio", "more", "pc", "yours"]);
    expect(ids(false, true)).toEqual(["youtube", "radio", "more", "pc", "yours"]);
    expect(ids(true, true)).toEqual(["spotify", "youtube", "radio", "more", "pc", "yours"]);
    expect(isActive("/soundcloud", "/soundcloud/playlist/1")).toBe(true);
    expect(isActive("/bandcamp", "/soundcloud")).toBe(false);
  });

  it("keeps history, recap, bookmarks and collections whatever is connected", () => {
    const yours = sectionsFor({ spotify: false, youtube: false }).find((s) => s.id === "yours");
    expect(yours?.items.map((i) => i.href)).toEqual(["/history", "/recap", "/bookmarks", "/collections"]);
    expect(isActive("/collections", "/collections/abc")).toBe(true);
    expect(isActive("/history", "/recap")).toBe(false);
  });

  it("lights a section's home only on that page", () => {
    expect(isActive("/youtube", "/youtube")).toBe(true);
    expect(isActive("/youtube", "/youtube/search")).toBe(false);
    expect(isActive("/youtube/library", "/youtube/library")).toBe(true);
    expect(isActive("/", "/youtube")).toBe(false);
    expect(isActive("/library", "/library/x")).toBe(true);
  });
});
