import { describe, expect, it } from "vitest";
import type { LocalTrack } from "$lib/local/api";
import type { Track } from "$lib/spotify/types";
import type { ImportRow } from "./formats";
import { best, matchLocal, normalise, normalisePath, queriesFor, spotifyTrackId } from "./match";

const ID = "0123456789abcdefABCDEF";
const importRow = (over: Partial<ImportRow> = {}): ImportRow => ({ title: "Song", artist: "Band", album: "", durationMs: null, isrc: null, uri: null, path: null, ...over });
const track = (name: string, artist: string, durationMs = 200_000): Track => ({
  id: name,
  uri: `spotify:track:${name}`,
  name,
  artists: [{ id: "a", name: artist, uri: "spotify:artist:a" }],
  album: null,
  durationMs,
  explicit: false,
});

describe("matching to Spotify", () => {
  it("reads track ids from URIs and links", () => {
    expect(spotifyTrackId(`spotify:track:${ID}`)).toBe(ID);
    expect(spotifyTrackId(`https://open.spotify.com/intl-de/track/${ID}?si=x`)).toBe(ID);
    expect(spotifyTrackId(`spotify:album:${ID}`)).toBeNull();
    expect(spotifyTrackId(null)).toBeNull();
  });

  it("asks by ISRC first, then by title and artist", () => {
    expect(queriesFor(importRow({ isrc: "usaaa2400001", artist: "Band, Guest" }))).toEqual(['isrc:USAAA2400001', 'track:"Song" artist:"Band"', "Song Band"]);
    expect(queriesFor(importRow({ title: 'Say "hi"', artist: "" }))).toEqual(['Say "hi"']);
  });

  it("normalises versions and accents away", () => {
    expect(normalise("Café del Mar (Remastered 2011)")).toBe("cafedelmar");
    expect(normalise("Song - Live at Somewhere")).toBe("song");
    expect(normalise("Tune feat. Someone")).toBe("tune");
  });

  it("picks the result whose title, artist and length fit", () => {
    const row = importRow({ title: "Song (2011 Remaster)", artist: "Band", durationMs: 201_000 });
    expect(best(row, [track("Other", "Band"), track("Song", "Someone else"), track("Song", "Band", 400_000), track("Song", "Band")])?.durationMs).toBe(200_000);
    expect(best(row, [track("Other", "Band")])).toBeNull();
  });
});

describe("matching to local files", () => {
  const file = (id: string, path: string): LocalTrack => ({ id, path, title: id, artists: [], album: "", albumArtist: "", trackNo: null, discNo: null, year: null, durationMs: 1, artwork: null });

  it("compares Windows paths whatever their case, slashes or relative form", () => {
    expect(normalisePath("C:/Music/A.mp3")).toBe("c:\\music\\a.mp3");
    expect(normalisePath("..\\Rock\\b.flac", "C:\\Music\\Lists")).toBe("c:\\music\\rock\\b.flac");
    expect(normalisePath("\\\\nas\\share\\c.mp3", "C:\\x")).toBe("\\\\nas\\share\\c.mp3");
  });

  it("finds library files by path and keeps Spotify links", () => {
    const library = [file("a".repeat(32), "C:\\Music\\Rock\\b.flac")];
    const matches = matchLocal([importRow({ path: "..\\Rock\\B.flac" }), importRow({ uri: `spotify:track:${ID}`, artist: "One, Two" }), importRow({ path: "missing.mp3" })], library, "C:\\Music\\Lists");
    expect(matches.map((m) => m.via)).toEqual(["path", "link", null]);
    expect(matches[0].item).toEqual({ kind: "local", id: "a".repeat(32) });
    expect(matches[1].item).toMatchObject({ kind: "spotify", track: { id: ID, uri: `spotify:track:${ID}`, artists: [{ name: "One" }, { name: "Two" }] } });
  });
});
