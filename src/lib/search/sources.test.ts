import { describe, expect, it } from "vitest";
import type { Link } from "$lib/providers/catalog";
import { answersLink, hueOf, matcherFor, searchable, selectedOf, SOURCES, type Setup } from "./sources";

const NOTHING: Setup = { spotify: false, youtube: false, servers: [], soundcloud: false };
const ids = (setup: Setup) => searchable(setup).map((s) => s.id);

describe("which sources Search asks", () => {
  it("works with no account at all: only the free sources", () => {
    expect(ids(NOTHING)).toEqual(["local", "bandcamp", "radio", "deezer", "apple", "mixcloud", "archive"]);
  });

  it("adds each service, server and configured app that is set up", () => {
    expect(ids({ ...NOTHING, youtube: true })).toContain("youtube");
    expect(ids({ ...NOTHING, youtube: true })).not.toContain("spotify");
    expect(ids({ spotify: true, youtube: true, servers: ["jellyfin"], soundcloud: true })).toEqual([
      "spotify",
      "youtube",
      "local",
      "jellyfin",
      "bandcamp",
      "soundcloud",
      "radio",
      "deezer",
      "apple",
      "mixcloud",
      "archive",
    ]);
  });

  it("colours a page like the source it belongs to", () => {
    expect(hueOf("/deezer")).toBe(SOURCES.find((s) => s.id === "deezer")!.hue);
    expect(hueOf("/youtube/search")).toBe(SOURCES.find((s) => s.id === "youtube")!.hue);
    // Spotify's page is "/", which every address starts with: it must not claim them all.
    expect(hueOf("/somewhere/else")).toBe(100);
    expect(hueOf("/deezer-ish")).toBe(100);
  });

  it("gives every source its own id and page", () => {
    expect(new Set(SOURCES.map((s) => s.id)).size).toBe(SOURCES.length);
    expect(new Set(SOURCES.map((s) => s.href)).size).toBe(SOURCES.length);
  });
});

describe("where a catalogue hit plays", () => {
  it("prefers the listener's own service, and always has somewhere", () => {
    expect(matcherFor({ ...NOTHING, spotify: true, youtube: true }).id).toBe("spotify");
    expect(matcherFor({ ...NOTHING, youtube: true, soundcloud: true }).id).toBe("youtube");
    expect(matcherFor({ ...NOTHING, soundcloud: true }).id).toBe("soundcloud");
    expect(matcherFor(NOTHING).id).toBe("bandcamp");
  });

  it("only matches on sources Carbon plays itself", () => {
    expect(matcherFor(NOTHING).plays).toBe("here");
  });
});

describe("the selected pill", () => {
  it("is the source the address names, or All when that source can't be searched", () => {
    const available = searchable(NOTHING);
    expect(selectedOf("deezer", available)).toBe("deezer");
    expect(selectedOf("spotify", available)).toBe("all");
    expect(selectedOf("nonsense", available)).toBe("all");
    expect(selectedOf(null, available)).toBe("all");
  });
});

describe("a pasted link", () => {
  const link = (source: Link["source"], kind: Link["kind"]): Link => ({ source, kind, id: "1", url: "https://example.test/", country: "us" });

  it("is answered for songs Carbon can find elsewhere, and for anything from Tidal", () => {
    expect(answersLink(link("tidal", "track"))).toBe(true);
    expect(answersLink(link("tidal", "playlist"))).toBe(true);
    expect(answersLink(link("deezer", "track"))).toBe(true);
    expect(answersLink(link("apple", "track"))).toBe(true);
  });

  it("is left to the ordinary search otherwise", () => {
    expect(answersLink(link("deezer", "album"))).toBe(false);
    expect(answersLink(link("spotify", "track"))).toBe(false);
    expect(answersLink(link("mixcloud", "track"))).toBe(false);
    expect(answersLink(null)).toBe(false);
  });
});
