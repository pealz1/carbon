import { describe, expect, it } from "vitest";
import type { Station } from "$lib/radio/api";
import type { Card, Track } from "$lib/spotify/types";
import { briefOf, fromBandcamp, fromCatalog, fromLocal, fromSoundcloud, fromSpotify, fromStations, fromYoutube, isEmpty, NOTHING, progressOf } from "./map";

const track = (name: string, artist = "Ana"): Track => ({
  id: name,
  uri: `local:${name}`,
  name,
  artists: [{ id: "", name: artist, uri: "" }],
  album: null,
  durationMs: 1000,
  explicit: false,
});
const card = (id: string, kind: Card["kind"] = "album"): Card => ({ kind, id, uri: `x:${id}`, title: id, subtitle: "", image: null, playUri: `x:${id}` });
const station = (id: string): Station => ({ id, name: id, streamUrl: "https://radio.test/a", icon: null, tags: [], country: "", codec: "", bitrate: 0 });
const many = <T>(n: number, make: (id: string) => T): T[] => Array.from({ length: n }, (_, i) => make(String(i)));

describe("each source in the common shape", () => {
  it("keeps Spotify's songs and its three shelves, artists first", () => {
    const found = fromSpotify({ tracks: [track("a")], artists: [card("1", "artist")], albums: [card("2")], playlists: [card("3", "playlist")] });
    expect(found.tracks).toHaveLength(1);
    expect(found.shelves.map((s) => s.title)).toEqual(["Artists", "Albums", "Playlists"]);
  });

  it("leads with the first artist, else the first song, as Spotify's search always has", () => {
    expect(fromSpotify({ tracks: [track("a")], artists: [card("1", "artist")], albums: [], playlists: [] }).top?.kind).toBe("artist");
    expect(fromSpotify({ tracks: [track("a")], artists: [], albums: [], playlists: [] }).top).toMatchObject({ kind: "track", title: "a", playUri: "local:a" });
    expect(fromSpotify({ tracks: [], artists: [], albums: [], playlists: [] }).top).toBeNull();
    expect(fromYoutube({ top: card("9"), songs: [], albums: [], artists: [], playlists: [] }).top?.id).toBe("9");
  });

  it("leaves out a shelf with nothing on it", () => {
    expect(fromYoutube({ top: null, songs: [], albums: [], artists: [card("1", "artist")], playlists: [] }).shelves.map((s) => s.title)).toEqual(["Artists"]);
    expect(fromBandcamp({ tracks: [], albums: [], artists: [] })).toEqual(NOTHING);
  });

  it("lists only the SoundCloud songs Carbon can play", () => {
    const found = fromSoundcloud({ tracks: [{ track: track("plays"), reason: null }, { track: track("preview"), reason: "Preview only" }], playlists: [], users: [] });
    expect(found.tracks.map((t) => t.name)).toEqual(["plays"]);
  });

  it("finds local songs by title, artist or album, whatever the accents", () => {
    const library = [track("São Paulo"), track("Other", "Sao Band"), track("Unrelated", "Nobody")];
    expect(fromLocal(library, "sao").tracks.map((t) => t.name)).toEqual(["São Paulo", "Other"]);
    expect(fromLocal(many(80, (id) => track(`song ${id}`)), "song").tracks).toHaveLength(50);
  });

  it("drops catalogue hits with no name or no https address to act on", () => {
    const hits = fromCatalog([
      { title: "Keep", artist: "A", durationMs: 0, url: "https://www.deezer.com/track/1" },
      { title: " ", artist: "A", durationMs: 0, url: "https://www.deezer.com/track/2" },
      { title: "No address", artist: "A", durationMs: 0 },
      { title: "Plain http", artist: "A", durationMs: 0, url: "http://www.deezer.com/track/3" },
    ]).hits;
    expect(hits.map((h) => h.title)).toEqual(["Keep"]);
  });

  it("caps a long list of stations", () => {
    expect(fromStations(many(60, station)).stations).toHaveLength(24);
  });
});

describe("the best few", () => {
  const full = { top: card("top"), tracks: many(9, track), hits: [], stations: many(9, station), shelves: [{ title: "Albums", cards: many(20, card) }, { title: "Artists", cards: many(3, card) }] };

  it("shows four rows and one short shelf of each source", () => {
    const brief = briefOf(full);
    expect(brief.tracks).toHaveLength(4);
    expect(brief.stations).toHaveLength(4);
    expect(brief.shelves).toHaveLength(1);
    expect(brief.shelves[0].cards).toHaveLength(8);
    expect(brief.top).toBeNull();
  });

  it("says where a search stands: failed beats loading, and an answer with nothing in it is empty", () => {
    expect(progressOf({ loading: true, error: null, data: full })).toBe("loading");
    expect(progressOf({ loading: false, error: "Couldn't reach Deezer.", data: full })).toBe("failed");
    expect(progressOf({ loading: false, error: null, data: NOTHING })).toBe("empty");
    expect(progressOf({ loading: false, error: null, data: null })).toBe("empty");
    expect(progressOf({ loading: false, error: null, data: full })).toBe("found");
  });

  it("knows an empty answer from a full one", () => {
    expect(isEmpty(NOTHING)).toBe(true);
    expect(isEmpty(full)).toBe(false);
    expect(isEmpty({ ...NOTHING, stations: [station("1")] })).toBe(false);
  });
});
