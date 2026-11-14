import { describe, expect, it, vi } from "vitest";
import { ownerOfUri } from "$lib/sources";
import { isStreamUri } from "$lib/stream/uri";
import { pageHref } from "$lib/youtube/uri";
import * as map from "./map";
import { brief, dimmedOf, playableOf } from "./shared/listed";
import { parseSoundcloudUri, soundcloudHref, soundcloudUri } from "./uri";

// Trimmed from real api-v2 answers; titles and names are invented.
const MEDIA = "https://api-v2.soundcloud.com/media/soundcloud:tracks:234194052/628e7ed6/stream";
const transcoding = (protocol: string, snipped = false) => ({ url: `${MEDIA}/${protocol}`, preset: "mp3_0_0", duration: 88838, snipped, format: { protocol, mime_type: "audio/mpeg" }, quality: "sq" });
const USER = { avatar_url: "https://i1.sndcdn.com/avatars-AoOZArdjJeTD0ojZ-02wQZA-large.jpg", id: 1759895682, kind: "user", username: "Quiet Harbour", track_count: 47, followers_count: 353 };
const TRACK = {
  artwork_url: "https://i1.sndcdn.com/artworks-ucC5i3jyPtY0o5CR-T3dadw-large.jpg",
  duration: 88838,
  full_duration: 88791,
  id: 234194052,
  kind: "track",
  publisher_metadata: { id: 234194052, urn: "soundcloud:tracks:234194052", explicit: false },
  title: "Low Tide",
  media: { transcodings: [transcoding("hls"), transcoding("progressive")] },
  policy: "MONETIZE",
  user: USER,
};
const with_ = (changes: object) => ({ ...TRACK, ...changes });
const STUB = { id: 2314954568, kind: "track", monetization_model: "AD_SUPPORTED", policy: "MONETIZE" };
const PLAYLIST = { artwork_url: null, created_at: "2024-03-02T10:00:00Z", id: 2233110584, kind: "playlist", is_album: false, release_date: null, title: "Slow Mornings", track_count: 33, user: USER, tracks: [TRACK, STUB] };

describe("SoundCloud URIs", () => {
  it("round-trip and route to the stream queue and to their own pages", () => {
    expect(parseSoundcloudUri(soundcloudUri("playlist", "2233110584"))).toEqual({ item: "playlist", id: "2233110584" });
    expect(soundcloudHref("soundcloud:user:34878670")).toBe("/soundcloud/user/34878670");
    expect(soundcloudHref("soundcloud:track:1")).toBeNull();
    expect(pageHref("playlist", { id: "2233110584", uri: "soundcloud:playlist:2233110584" })).toBe("/soundcloud/playlist/2233110584");
    expect(isStreamUri("soundcloud:track:1")).toBe(true);
    expect(ownerOfUri("soundcloud:track:1")).toBe("stream");
  });

  it("refuse anything that isn't a numeric id", () => {
    for (const bad of ["soundcloud:track:", "soundcloud:track:abc", "soundcloud:track:1/../2", "soundcloud:station:1", "soundcloud:user:1:2", "spotify:track:1"]) {
      expect(parseSoundcloudUri(bad), bad).toBeNull();
    }
  });
});

describe("SoundCloud songs", () => {
  it("map into Carbon's track shape", () => {
    const { track, reason } = map.track(TRACK);
    expect(reason).toBeNull();
    expect(track).toEqual({
      id: "234194052",
      uri: "soundcloud:track:234194052",
      name: "Low Tide",
      artists: [{ id: "1759895682", name: "Quiet Harbour", uri: "soundcloud:user:1759895682" }],
      album: { id: "", name: "", uri: "", image: "https://i1.sndcdn.com/artworks-ucC5i3jyPtY0o5CR-T3dadw-t300x300.jpg" },
      durationMs: 88791,
      explicit: false,
    });
  });

  it("borrow the uploader's picture when a song has no artwork, and trust only SoundCloud's image hosts", () => {
    expect(map.track(with_({ artwork_url: null })).track.album?.image).toBe("https://i1.sndcdn.com/avatars-AoOZArdjJeTD0ojZ-02wQZA-t300x300.jpg");
    expect(map.track(with_({ artwork_url: "https://evil.example/a-large.jpg", user: null })).track.album).toBeNull();
    expect(map.art("http://i1.sndcdn.com/artworks-x-large.jpg")).toBeNull();
    expect(map.art("https://i1.sndcdn.com.evil.example/artworks-x-large.jpg")).toBeNull();
  });

  it("say why a song can't play: only a full-length plain stream does", () => {
    const only = (...list: object[]) => with_({ media: { transcodings: list } });
    expect(map.unplayable(only(transcoding("hls")))).toBeNull(); // MP3 segments play through the HLS player
    const segments = (mime_type: string, protocol = "hls") => ({ ...transcoding(protocol), format: { protocol, mime_type } });
    expect(map.unplayable(only(segments("audio/mpeg")))).toBeNull();
    expect(map.unplayable(only(segments('audio/mp4; codecs="mp4a.40.2"')))).toBeNull();
    expect(map.unplayable(only(segments('audio/ogg; codecs="opus"')))).toBe(map.REASONS.segmented);
    expect(map.unplayable(only(segments("audio/mp4", "ctr-encrypted-hls")))).toBe(map.REASONS.protected);
    expect(map.unplayable(only(transcoding("cbc-encrypted-hls"), transcoding("ctr-encrypted-hls")))).toBe(map.REASONS.protected);
    expect(map.unplayable(only(transcoding("hls", true), transcoding("progressive", true)))).toBe(map.REASONS.preview);
    expect(map.unplayable(with_({ policy: "SNIP" }))).toBe(map.REASONS.preview);
    expect(map.unplayable(with_({ policy: "BLOCK" }))).toBe(map.REASONS.blocked);
    expect(map.unplayable(with_({ media: undefined }))).toBe(map.REASONS.segmented);
  });

  it("split a list into what plays and what is shown dimmed", () => {
    const listed = map.tracks([TRACK, with_({ id: 7, policy: "SNIP" }), STUB, "nonsense", null]);
    expect(playableOf(listed).map((t) => t.id)).toEqual(["234194052"]);
    expect(dimmedOf(listed).map((l) => [l.track.id, l.reason])).toEqual([["7", map.REASONS.preview]]);
  });

  it("read a chart's songs out of their wrappers", () => {
    expect(map.chart([{ track: TRACK, score: 1 }, { score: 2 }]).map((l) => l.track.id)).toEqual(["234194052"]);
  });
});

describe("SoundCloud playlists and people", () => {
  it("fill a playlist's stubbed songs in order and drop the ones SoundCloud no longer has", () => {
    const gone = { ...STUB, id: 99 };
    expect(map.stubIds([TRACK, STUB, gone])).toEqual(["2314954568", "99"]);
    const filled = map.fillStubs([STUB, TRACK, gone], [with_({ id: 2314954568, title: "Second Light" })]);
    expect(filled.map((t) => t.title)).toEqual(["Second Light", "Low Tide"]);
  });

  it("map a playlist with its owner, falling back to its first song's artwork", () => {
    const p = map.playlist(PLAYLIST, [TRACK]);
    expect(p).toMatchObject({ id: "2233110584", uri: "soundcloud:playlist:2233110584", name: "Slow Mornings", album: false, year: "2024", total: 33 });
    expect(p.image).toBe("https://i1.sndcdn.com/artworks-ucC5i3jyPtY0o5CR-T3dadw-t500x500.jpg");
    expect(p.owner.uri).toBe("soundcloud:user:1759895682");
    expect(p.tracks).toHaveLength(1);
  });

  it("make cards that open Carbon's pages, and leave out generated playlists", () => {
    const album = map.playlistCard({ ...PLAYLIST, is_album: true });
    expect(album).toMatchObject({ kind: "album", subtitle: "Album · Quiet Harbour", playUri: "soundcloud:playlist:2233110584" });
    expect(map.userCard(USER)).toMatchObject({ kind: "artist", uri: "soundcloud:user:1759895682", title: "Quiet Harbour", subtitle: "47 songs" });
    const system = { kind: "system-playlist", id: "soundcloud:system-playlists:trending-by-genre:trap", title: "Trap" };
    const shelves = map.selections([
      { title: "Curated", items: { collection: [PLAYLIST, system] } },
      { title: "Trending by genre", items: { collection: [system] } },
      { title: "", items: { collection: [PLAYLIST] } },
    ]);
    expect(shelves.map((s) => [s.title, s.cards.length])).toEqual([["Curated", 1]]);
  });

  it("survive an answer that isn't the shape it used to be", () => {
    expect(map.tracks(undefined)).toEqual([]);
    expect(map.selections({ collection: "moved" })).toEqual([]);
    expect(map.playlist({}, []).name).toBe("Untitled");
    expect(map.user({ id: "x" })).toMatchObject({ id: "", name: "Unknown artist", image: null, followers: 0 });
  });
});

describe("the short memory for answers", () => {
  it("shares one request for a while, then asks again", async () => {
    let clock = 0;
    const load = vi.fn(async (key: string) => `${key}!`);
    const get = brief(load, 100, () => clock);
    expect(await Promise.all([get("a"), get("a")])).toEqual(["a!", "a!"]);
    expect(load).toHaveBeenCalledTimes(1);
    clock = 150;
    await get("a");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("forgets a failed answer at once", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce("ok");
    const get = brief(load);
    await expect(get("a")).rejects.toThrow("down");
    expect(await get("a")).toBe("ok");
  });
});
