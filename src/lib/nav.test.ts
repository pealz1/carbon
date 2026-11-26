import { describe, expect, it } from "vitest";
import { groupItems, groupOf, groupPages, isActive, sectionsFor, sidebarSections } from "./nav";

const hrefs = (items: { href: string }[]) => items.map((i) => i.href);

describe("navigation", () => {
  it("shows one short list with no heading when one service (or none) is connected", () => {
    const one = sidebarSections({ spotify: true, youtube: false });
    expect(one.map((s) => s.label)).toEqual([""]);
    expect(hrefs(one[0].items)).toEqual(["/", "/library", "/liked", "/radio", "/local"]);
    expect(hrefs(sidebarSections({ spotify: false, youtube: true })[0].items)).toEqual(["/youtube", "/youtube/library", "/youtube/playlist/LM", "/radio", "/local"]);
  });

  it("gives someone with no service a Library to hang Carbon's shelves on", () => {
    const none = sidebarSections({ spotify: false, youtube: false });
    expect(none).toHaveLength(1);
    expect(none[0].items.map((i) => [i.href, i.label])).toEqual([["/collections", "Library"], ["/radio", "Radio"], ["/local", "Local files"]]);
  });

  it("keeps each service's name when several are connected", () => {
    expect(sidebarSections({ spotify: true, youtube: true }).map((s) => s.id)).toEqual(["spotify", "youtube", "carbon"]);
    expect(sidebarSections({ spotify: true, youtube: false, servers: ["plex"] }).map((s) => s.label)).toEqual(["Spotify", "Plex", "Carbon"]);
  });

  it("puts every other page in a place: the library, your listening, or search", () => {
    const running = { spotify: true, youtube: false };
    expect(hrefs(groupPages("library", running))).toEqual(["/library", "/podcasts", "/smart", "/collections", "/mixes", "/bookmarks", "/offline", "/import"]);
    expect(hrefs(groupPages("you", running))).toEqual(["/stats", "/profile", "/wrapped", "/recap", "/history"]);
    expect(hrefs(groupItems("search", { spotify: false, youtube: false }))).toEqual(["/soundcloud", "/tidal", "/apple", "/deezer", "/mixcloud", "/bandcamp", "/archive"]);
    expect(hrefs(groupPages("library", { spotify: false, youtube: true }))[0]).toBe("/youtube/library");
  });

  it("knows which place a page belongs to", () => {
    expect(groupOf("/library")).toBe("library");
    expect(groupOf("/collections/abc")).toBe("library");
    expect(groupOf("/youtube/library")).toBe("library");
    expect(groupOf("/soundcloud/playlist/1")).toBe("search");
    expect(groupOf("/recap")).toBe("you");
    expect(groupOf("/sound")).toBe("more");
    expect(groupOf("/")).toBeUndefined();
    expect(groupOf("/radio")).toBeUndefined();
  });

  it("keeps every page in the full list the command palette reads", () => {
    const all = sectionsFor({ spotify: true, youtube: true }).flatMap((s) => hrefs(s.items));
    for (const href of ["/soundcloud", "/import", "/sound", "/profile", "/recap", "/wrapped", "/bookmarks", "/smart", "/stats", "/history", "/collections", "/mixes", "/radio", "/podcasts", "/offline", "/youtube/search"]) {
      expect(all).toContain(href);
    }
  });

  it("lights an entry on the pages under it, and a home only on itself", () => {
    expect(isActive("/soundcloud", "/soundcloud/playlist/1")).toBe(true);
    expect(isActive("/bandcamp", "/soundcloud")).toBe(false);
    expect(isActive("/collections", "/collections/abc")).toBe(true);
    expect(isActive("/youtube", "/youtube")).toBe(true);
    expect(isActive("/youtube", "/youtube/search")).toBe(false);
    expect(isActive("/", "/youtube")).toBe(false);
    expect(isActive("/library", "/library/x")).toBe(true);
  });
});
