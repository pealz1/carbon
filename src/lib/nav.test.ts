import { describe, expect, it } from "vitest";
import { hubItems, hubOf, isActive, sectionsFor, sidebarSections } from "./nav";

describe("sidebar sections", () => {
  it("shows one section per connected service, with discover, the PC's and yours always", () => {
    const ids = (spotify: boolean, youtube: boolean) => sidebarSections({ spotify, youtube }).map((s) => s.id);
    expect(ids(true, false)).toEqual(["spotify", "discover", "pc", "yours"]);
    expect(ids(false, true)).toEqual(["youtube", "discover", "pc", "yours"]);
    expect(ids(true, true)).toEqual(["spotify", "youtube", "discover", "pc", "yours"]);
    expect(isActive("/soundcloud", "/soundcloud/playlist/1")).toBe(true);
    expect(isActive("/bandcamp", "/soundcloud")).toBe(false);
  });

  it("keeps the sidebar short: hub pages list the rest", () => {
    const shown = sidebarSections({ spotify: true, youtube: false }).flatMap((s) => s.items.map((i) => i.href));
    expect(shown).toEqual(["/", "/library", "/liked", "/podcasts", "/browse", "/radio", "/mixes", "/local", "/offline", "/history", "/collections", "/you"]);
    expect(hubItems("/browse", { spotify: false, youtube: false }).map((i) => i.href)).toEqual(["/soundcloud", "/apple", "/deezer", "/mixcloud", "/bandcamp", "/archive", "/import"]);
    expect(hubItems("/you", { spotify: false, youtube: false }).map((i) => i.href)).toEqual(["/sound", "/profile", "/recap", "/bookmarks"]);
    expect(hubItems("/you", { spotify: true, youtube: false }).map((i) => i.href)).toContain("/stats");
  });

  it("keeps every page in the full list the command palette reads", () => {
    const all = sectionsFor({ spotify: true, youtube: false }).flatMap((s) => s.items.map((i) => i.href));
    for (const href of ["/soundcloud", "/import", "/sound", "/profile", "/recap", "/bookmarks", "/smart", "/stats", "/history", "/collections", "/mixes"]) expect(all).toContain(href);
  });

  it("lights a hub's entry on the pages under it", () => {
    expect(hubOf("/soundcloud/playlist/1")).toBe("/browse");
    expect(hubOf("/recap")).toBe("/you");
    expect(hubOf("/history")).toBeUndefined();
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
