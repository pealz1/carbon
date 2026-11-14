import { describe, expect, it } from "vitest";
import { all, clicked, copyText, NONE, pastedSpotifyUris, picked } from "./selection";
import type { Track } from "./spotify/types";

const ID = "6rqhFgbbKwnb9MLmUQDhG6";
const track = (uri: string, name = "Song", artist = "Artist"): Track => ({ id: uri, uri, name, artists: [{ id: "", name: artist, uri: "" }], album: null, durationMs: 1000, explicit: false });
const rows = (s: { rows: ReadonlySet<number> }) => [...s.rows].sort((a, b) => a - b);

describe("selecting rows", () => {
  it("picks one row on a plain click and toggles with Ctrl", () => {
    const one = clicked(NONE, 3, { ctrl: false, shift: false });
    expect([rows(one), one.anchor]).toEqual([[3], 3]);
    const two = clicked(one, 5, { ctrl: true, shift: false });
    expect(rows(two)).toEqual([3, 5]);
    expect(rows(clicked(two, 3, { ctrl: true, shift: false }))).toEqual([5]);
    expect(rows(clicked(two, 1, { ctrl: false, shift: false }))).toEqual([1]);
  });

  it("extends from the anchor with Shift, in either direction", () => {
    const start = clicked(NONE, 4, { ctrl: false, shift: false });
    expect(rows(clicked(start, 6, { ctrl: false, shift: true }))).toEqual([4, 5, 6]);
    expect(rows(clicked(start, 2, { ctrl: false, shift: true }))).toEqual([2, 3, 4]);
    const kept = clicked({ rows: new Set([0, 4]), anchor: 4 }, 5, { ctrl: true, shift: true });
    expect(rows(kept)).toEqual([0, 4, 5]);
    expect(rows(clicked(NONE, 2, { ctrl: false, shift: true }))).toEqual([2]); // nothing to extend from
  });

  it("selects everything, and reads the selection back in list order", () => {
    expect(rows(all(3))).toEqual([0, 1, 2]);
    expect(rows(all(0))).toEqual([]);
    const tracks = [track("a"), track("b"), track("c")];
    expect(picked(tracks, { rows: new Set([2, 0]), anchor: 0 }).map((t) => t.uri)).toEqual(["a", "c"]);
  });
});

describe("copy and paste", () => {
  it("copies links where there are any, and names otherwise", () => {
    const text = copyText([track(`spotify:track:${ID}`), track("ytm:video:J7p4bzqLvCw"), track("local:abc", "Tune", "Someone")]);
    expect(text.split("\n")).toEqual([`https://open.spotify.com/track/${ID}`, "https://music.youtube.com/watch?v=J7p4bzqLvCw", "Someone - Tune"]);
  });

  it("reads Spotify songs out of pasted text, once each, ignoring everything else", () => {
    const pasted = `https://open.spotify.com/track/${ID}?si=x\nspotify:track:${ID}\nhttps://open.spotify.com/album/${ID} hello https://music.youtube.com/watch?v=J7p4bzqLvCw`;
    expect(pastedSpotifyUris(pasted)).toEqual([`spotify:track:${ID}`]);
    expect(pastedSpotifyUris("")).toEqual([]);
  });
});
