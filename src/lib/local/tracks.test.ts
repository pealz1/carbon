import { describe, expect, it } from "vitest";
import type { Track } from "$lib/spotify/types";
import type { LocalTrack } from "./api";
import { fromLocal, hasPage, isLocalUri, localId, toItem } from "./tracks";

const local: LocalTrack = {
  id: "0123456789abcdef0123456789abcdef",
  path: "C:\\Music\\Song.flac",
  title: "Song",
  artists: ["A", "B"],
  album: "Album",
  albumArtist: "A",
  trackNo: 1,
  discNo: null,
  year: 2001,
  durationMs: 1000,
  artwork: "C:\\cache\\art.jpg",
};

describe("local tracks", () => {
  const track = fromLocal(local, (p) => `asset://${p}`);

  it("maps to the shared Track model without Spotify ids or file paths", () => {
    expect(track.uri).toBe(`local:${local.id}`);
    expect(track.id).toBe(track.uri);
    expect(track.artists.map((a) => a.name)).toEqual(["A", "B"]);
    expect(track.album?.image).toBe("asset://C:\\cache\\art.jpg");
    expect(JSON.stringify(track)).not.toContain("Music");
    expect(hasPage(track.album)).toBe(false);
    expect(hasPage({ id: "4uLU6hMCjMI75M1A2tKUQC" })).toBe(true);
  });

  it("round-trips through playlist items", () => {
    expect(isLocalUri(track.uri)).toBe(true);
    expect(localId(track.uri)).toBe(local.id);
    expect(toItem(track)).toEqual({ kind: "local", id: local.id });
    const spotify: Track = { ...track, id: "x", uri: "spotify:track:x" };
    expect(toItem(spotify)).toEqual({ kind: "spotify", track: spotify });
  });
});
