import { describe, expect, it } from "vitest";
import { dimmedOf, playableOf } from "$lib/soundcloud/shared/listed";
import { ownerOfUri } from "$lib/sources";
import { pageHref } from "$lib/youtube/uri";
import * as map from "./map";
import { artistUri, bandcampHref, parseBandcampUri, releaseUri, trackUri } from "./uri";

// Trimmed from real Bandcamp answers; titles and names are invented.
const STREAM = { "mp3-128": "https://bandcamp.com/stream_redirect?enc=mp3-128&track_id=1462092352&ts=1794600227&t=1508b1e37b23381f" };
const song = (changes: object = {}) => ({ track_id: 1462092352, title: "First Frost", track_num: 1, streaming_url: STREAM, duration: 231.25, album_title: null, band_name: "Paper Lanterns", art_id: null, album_id: 4061576051, is_streamable: true, band_id: 851846867, ...changes });
const ALBUM = {
  id: 4061576051,
  type: "a",
  title: "Winter Rooms",
  art_id: 3954217503,
  band: { band_id: 851846867, name: "Paper Lanterns", image_id: 41409712, location: "Bristol, UK" },
  tralbum_artist: "Paper Lanterns",
  album_id: 4061576051,
  release_date: 1599091200,
  tracks: [song(), song({ track_id: 1285805036, title: "Thaw", track_num: 2, streaming_url: null, is_streamable: false })],
};
const SINGLE = { ...ALBUM, id: 1535375173, type: "t", title: "Night Bus", album_id: 468958508, album_title: "Late Routes", tracks: [song({ track_id: 1535375173, title: "Night Bus", album_id: 468958508 })] };
const FOUND = [
  { type: "b", id: 2573810818, img_id: 4745804, name: "Glass Orchard", location: "California", is_label: false },
  { type: "a", id: 4061576051, art_id: 3954217503, name: "Winter Rooms", band_id: 851846867, band_name: "Paper Lanterns" },
  { type: "t", id: 1535375173, art_id: 1542788675, name: "Night Bus", band_id: 249773827, band_name: "Harbour Lights", album_name: "Late Routes", album_id: 468958508 },
  { type: "t", id: 77, art_id: 102408238, name: "Loose Leaf", band_id: 249773827, band_name: "Harbour Lights", album_name: null, album_id: null },
  { type: "f", id: 5, name: "A fan" },
  { type: "a", id: "../x", name: "Broken", band_id: 1 },
];
const BAND = {
  id: 2573810818,
  name: "Glass Orchard",
  bio_image_id: 4745804,
  location: "California",
  discography: [
    { item_id: 3082648759, item_type: "album", artist_name: null, band_name: "Glass Orchard", title: "Volume 26", art_id: 3331984077, release_date: "06 Oct 2023 00:00:00 GMT", band_id: 2573810818 },
    { item_id: 12, item_type: "track", artist_name: "A Guest", band_name: "Glass Orchard", title: "One Off", art_id: 102408238, release_date: "01 Jan 2020 00:00:00 GMT", band_id: 2573810818 },
    { item_type: "album", title: "No id" },
  ],
};

describe("Bandcamp URIs", () => {
  it("hold Bandcamp's ids and nothing else", () => {
    expect(parseBandcampUri(trackUri("851846867", "1462092352"))).toEqual({ item: "track", band: "851846867", id: "1462092352" });
    expect(parseBandcampUri(releaseUri("851846867", "a", "4061576051"))).toEqual({ item: "album", band: "851846867", kind: "a", id: "4061576051" });
    expect(parseBandcampUri(releaseUri("1", "t", "2"))).toEqual({ item: "album", band: "1", kind: "t", id: "2" });
    expect(parseBandcampUri(artistUri("2573810818"))).toEqual({ item: "artist", band: "2573810818" });
    for (const bad of ["bandcamp:album:1:2", "bandcamp:track:1:a2", "bandcamp:track:1", "bandcamp:artist:1:2", "bandcamp:album:https%3A%2F%2Fevil.example:a1", "bandcamp:album:1:a1/../2", "bandcamp:label:1"]) {
      expect(parseBandcampUri(bad), bad).toBeNull();
    }
  });

  it("route to Carbon's pages and to the stream queue", () => {
    expect(bandcampHref("bandcamp:album:851846867:a4061576051")).toBe("/bandcamp/album/851846867/a4061576051");
    expect(bandcampHref("bandcamp:artist:2573810818")).toBe("/bandcamp/artist/2573810818");
    expect(bandcampHref("bandcamp:track:1:2")).toBeNull();
    expect(pageHref("artist", { id: "2573810818", uri: "bandcamp:artist:2573810818" })).toBe("/bandcamp/artist/2573810818");
    expect(ownerOfUri("bandcamp:track:1:2")).toBe("stream");
  });
});

describe("a Bandcamp release", () => {
  it("maps an album and its songs, marking the ones Bandcamp doesn't stream", () => {
    const r = map.release(ALBUM);
    expect(r).toMatchObject({ uri: "bandcamp:album:851846867:a4061576051", name: "Winter Rooms", single: false, year: "2020", image: "https://f4.bcbits.com/img/a3954217503_5.jpg" });
    expect(r.artist).toEqual({ id: "851846867", name: "Paper Lanterns", uri: "bandcamp:artist:851846867" });
    expect(playableOf(r.tracks)).toEqual([
      {
        id: "1462092352",
        uri: "bandcamp:track:851846867:1462092352",
        name: "First Frost",
        artists: [{ id: "851846867", name: "Paper Lanterns", uri: "bandcamp:artist:851846867" }],
        album: { id: "4061576051", name: "Winter Rooms", uri: "bandcamp:album:851846867:a4061576051", image: "https://f4.bcbits.com/img/a3954217503_2.jpg" },
        durationMs: 231250,
        explicit: false,
      },
    ]);
    expect(dimmedOf(r.tracks).map((l) => [l.track.name, l.reason])).toEqual([["Thaw", map.NO_STREAM]]);
  });

  it("maps a song released on its own, linking its row to the album it belongs to", () => {
    const r = map.release(SINGLE);
    expect(r).toMatchObject({ uri: "bandcamp:album:851846867:t1535375173", single: true });
    expect(r.tracks[0].track.album).toMatchObject({ id: "468958508", name: "Late Routes", uri: "bandcamp:album:851846867:a468958508" });
  });

  it("survives an answer that isn't the shape it used to be", () => {
    expect(map.release({})).toMatchObject({ name: "Untitled", image: null, tracks: [], year: "" });
    expect(map.release({ tracks: [{ title: "No id" }, "nonsense"] }).tracks).toEqual([]);
  });
});

describe("Bandcamp search and artists", () => {
  it("sorts results into songs, albums and artists and drops what it can't address", () => {
    const found = map.searchResults(FOUND);
    expect(found.artists).toEqual([{ kind: "artist", id: "2573810818", uri: "bandcamp:artist:2573810818", title: "Glass Orchard", subtitle: "Artist · California", image: "https://f4.bcbits.com/img/0004745804_2.jpg", playUri: "bandcamp:artist:2573810818" }]);
    expect(found.albums.map((a) => [a.uri, a.subtitle])).toEqual([["bandcamp:album:851846867:a4061576051", "Paper Lanterns"]]);
    expect(found.tracks.map((t) => [t.uri, t.album?.uri, t.durationMs])).toEqual([
      ["bandcamp:track:249773827:1535375173", "bandcamp:album:249773827:a468958508", 0],
      ["bandcamp:track:249773827:77", "", 0],
    ]);
    expect(found.tracks[1].album?.image).toBe("https://f4.bcbits.com/img/a0102408238_2.jpg");
    expect(map.searchResults(null)).toEqual({ tracks: [], albums: [], artists: [] });
  });

  it("lists an artist's releases as cards that open and play", () => {
    const a = map.artist(BAND);
    expect(a).toMatchObject({ id: "2573810818", uri: "bandcamp:artist:2573810818", name: "Glass Orchard", location: "California", image: "https://f4.bcbits.com/img/0004745804_5.jpg" });
    expect(a.releases.map((c) => [c.uri, c.subtitle, c.kind])).toEqual([
      ["bandcamp:album:2573810818:a3082648759", "2023 · Glass Orchard", "album"],
      ["bandcamp:album:2573810818:t12", "2020 · A Guest", "album"],
    ]);
  });
});
