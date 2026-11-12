import { describe, expect, it } from "vitest";
import { artistEntry, describeReason, sameItem, skipReason, songEntry } from "./blocklist";
import type { Blocked, BlocklistData } from "./native";
import type { Track } from "./spotify/types";

const song = (uri: string, artists: { name: string; uri: string }[], explicit = false): Track => ({
  id: uri.split(":").at(-1)!,
  uri,
  name: "Placeholder song",
  artists: artists.map((a) => ({ id: "", ...a })),
  album: null,
  durationMs: 1000,
  explicit,
});

const blocked = (kind: Blocked["kind"], uri: string, name = "Name"): Blocked => ({ kind, uri, name, by: "" });
const list = (items: Blocked[], skipExplicit = false): BlocklistData => ({ items, skipExplicit });

describe("skipReason", () => {
  const spotify = song("spotify:track:t1", [
    { name: "Lead", uri: "spotify:artist:a1" },
    { name: "Guest", uri: "spotify:artist:a2" },
  ]);
  const youtube = song("ytm:video:v1", [{ name: "Some Uploader", uri: "" }], true);

  it("matches a blocked song by its link", () => {
    const item = blocked("song", "spotify:track:t1");
    expect(skipReason(spotify, list([item]))).toBe(item);
    expect(skipReason(spotify, list([blocked("song", "spotify:track:other")]))).toBeNull();
  });

  it("matches any credited artist, by link, or by name when either side has none", () => {
    const guest = blocked("artist", "spotify:artist:a2");
    expect(skipReason(spotify, list([guest]))).toBe(guest);
    const byName = blocked("artist", "", " some uploader ");
    expect(skipReason(youtube, list([byName]))).toBe(byName);
    // Two different links never match, even with the same name.
    expect(skipReason(spotify, list([blocked("artist", "ytm:artist:UC1", "Lead")]))).toBeNull();
  });

  it("skips explicit songs only when asked, using the looked-up flag when given", () => {
    expect(skipReason(youtube, list([], false))).toBeNull();
    expect(skipReason(youtube, list([], true))).toBe("explicit");
    expect(skipReason(spotify, list([], true))).toBeNull();
    expect(skipReason(spotify, list([], true), true)).toBe("explicit");
  });

  it("explains each reason", () => {
    expect(describeReason("explicit")).toBe("explicit");
    expect(describeReason(blocked("song", "spotify:track:t1"))).toBe("blocked song");
    expect(describeReason(blocked("artist", "", "Band"))).toBe("Band is blocked");
  });
});

describe("entries", () => {
  it("tells entries apart by kind and link, or by name without one", () => {
    expect(sameItem(blocked("artist", "spotify:artist:a1"), "artist", { uri: "spotify:artist:a1", name: "x" })).toBe(true);
    expect(sameItem(blocked("artist", "spotify:artist:a1"), "song", { uri: "spotify:artist:a1", name: "x" })).toBe(false);
    expect(sameItem(blocked("artist", "", "Band"), "artist", { uri: "", name: "band " })).toBe(true);
    expect(sameItem(blocked("artist", "", "Band"), "artist", { uri: "ytm:artist:UC1", name: "Band" })).toBe(false);
  });

  it("builds entries with who a song is by, within the saved length", () => {
    const track = { ...song("ytm:video:v1", [{ name: "A", uri: "" }, { name: " B ", uri: "" }]), name: `  ${"é".repeat(400)}  ` };
    const entry = songEntry(track);
    expect(entry).toMatchObject({ kind: "song", uri: "ytm:video:v1", by: "A, B" });
    expect(Array.from(entry.name)).toHaveLength(300);
    expect(songEntry({ ...track, name: "  " }).name).toBe("Untitled");
    expect(artistEntry({ id: "a", name: " Band ", uri: "spotify:artist:a" })).toEqual({ kind: "artist", uri: "spotify:artist:a", name: "Band", by: "" });
  });
});
