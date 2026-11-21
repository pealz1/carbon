import { describe, expect, it } from "vitest";
import { hubItems, hubOf, isActive, sectionsFor, sidebarSections } from "./nav";

describe("sidebar sections", () => {
  it("shows one section per connected service, and Carbon's own always", () => {
    const ids = (spotify: boolean, youtube: boolean) => sidebarSections({ spotify, youtube }).map((s) => s.id);
    expect(ids(true, false)).toEqual(["spotify", "carbon"]);
    expect(ids(false, true)).toEqual(["youtube", "carbon"]);
    expect(ids(true, true)).toEqual(["spotify", "youtube", "carbon"]);
    expect(isActive("/soundcloud", "/soundcloud/playlist/1")).toBe(true);
    expect(isActive("/bandcamp", "/soundcloud")).toBe(false);
  });

  it("keeps the sidebar to a few entries: hub pages list the rest", () => {
    const shown = (spotify: boolean, youtube: boolean) => sidebarSections({ spotify, youtube }).flatMap((s) => s.items.map((i) => i.href));
    expect(shown(true, false)).toEqual(["/", "/library", "/liked", "/browse", "/local", "/you"]);
    expect(shown(false, true)).toEqual(["/youtube", "/youtube/library", "/youtube/playlist/LM", "/browse", "/local", "/you"]);
    const browse = hubItems("/browse", { spotify: false, youtube: false }).map((i) => i.href);
    expect(browse).toEqual(["/radio", "/mixes", "/soundcloud", "/apple", "/deezer", "/mixcloud", "/bandcamp", "/archive", "/import"]);
    expect(hubItems("/browse", { spotify: true, youtube: false })[0].href).toBe("/podcasts");
    const yours = hubItems("/you", { spotify: false, youtube: false }).map((i) => i.href);
    expect(yours).toEqual(["/history", "/collections", "/recap", "/bookmarks", "/offline", "/sound", "/profile"]);
    expect(hubItems("/you", { spotify: true, youtube: false }).map((i) => i.href)).toContain("/stats");
  });

  it("keeps every page in the full list the command palette reads", () => {
    const all = sectionsFor({ spotify: true, youtube: true }).flatMap((s) => s.items.map((i) => i.href));
    for (const href of ["/soundcloud", "/import", "/sound", "/profile", "/recap", "/bookmarks", "/smart", "/stats", "/history", "/collections", "/mixes", "/radio", "/podcasts", "/offline", "/youtube/search"]) {
      expect(all).toContain(href);
    }
  });

  it("lights a hub's entry on the pages under it", () => {
    expect(hubOf("/soundcloud/playlist/1")).toBe("/browse");
    expect(hubOf("/recap")).toBe("/you");
    expect(hubOf("/history")).toBe("/you");
    expect(hubOf("/library")).toBeUndefined();
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
