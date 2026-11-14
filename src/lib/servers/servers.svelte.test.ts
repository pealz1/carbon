// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "$lib/spotify/types";

const h = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: h.invoke }));

const jf = await import("./jellyfin");
const sub = await import("./subsonic");
const { isServerUri, parseServerUri, serverHref, serverUri } = await import("./uri");
const { sectionsFor } = await import("$lib/nav");
const { canJoinQueue, ownerOf } = await import("$lib/sources");
const { StreamPlayback } = await import("$lib/stream/playback.svelte");
const { pageHref } = await import("$lib/youtube/uri");

const navidrome = { kind: "subsonic" as const, url: "http://nas:4533", username: "me", userId: "", mediaQuery: "u=me&t=tok&s=salt&v=1.16.1&c=Carbon" };
const jelly = { kind: "jellyfin" as const, url: "https://jf.example", username: "me", userId: "u1", mediaQuery: "ApiKey=tok&DeviceId=d1&UserId=u1" };

describe("server URIs", () => {
  it("round-trip ids that hold anything", () => {
    const uri = serverUri("subsonic", "album", "al-12/3 x");
    expect(isServerUri(uri)).toBe(true);
    expect(parseServerUri(uri)).toEqual({ kind: "subsonic", item: "album", id: "al-12/3 x" });
    expect(parseServerUri("server:emby:album:1")).toBeNull();
    expect(parseServerUri("server:subsonic:album:%E0%A4%A")).toBeNull();
    expect(parseServerUri("spotify:album:1")).toBeNull();
  });

  it("lead to Carbon's own pages", () => {
    expect(serverHref(serverUri("jellyfin", "artist", "ab12"))).toBe("/server/jellyfin/artist/ab12");
    expect(serverHref(serverUri("jellyfin", "track", "ab12"))).toBeNull();
    expect(pageHref("album", { id: "a 1", uri: serverUri("subsonic", "album", "a 1") })).toBe("/server/subsonic/album/a%201");
    expect(pageHref("album", { id: "x", uri: "spotify:album:x" })).toBe("/album/x");
  });

  it("keep server songs in a queue of their own", () => {
    const song = serverUri("subsonic", "track", "1");
    expect(ownerOf([song, serverUri("jellyfin", "track", "2")])).toBe("stream");
    expect(ownerOf([song, "spotify:track:6rqhFgbbKwnb9MLmUQDhG6"])).toBeNull();
    expect(canJoinQueue("stream", "ytm:video:7374CZQoS2Y")).toBe(false);
  });

  it("show a sidebar section only for connected servers", () => {
    const ids = (servers: string[]) => sectionsFor({ spotify: false, youtube: false, servers }).map((s) => s.id);
    expect(ids([])).not.toContain("subsonic");
    expect(ids(["jellyfin"])).toContain("jellyfin");
    expect(ids(["jellyfin"])).not.toContain("subsonic");
  });
});

describe("signed addresses", () => {
  it("are never handed on: not to Discord, the remote, or a file", async () => {
    const { shareable } = await import("./uri");
    const { httpsImage } = await import("$lib/history/song");
    const navidromeArt = "https://music.example/rest/getCoverArt.view?id=al-1&size=600&u=me&t=tok&s=salt&v=1.16.1&c=Carbon";
    const plexArt = "https://plex.example/library/metadata/7/thumb/1?X-Plex-Token=tok";
    const jellyfinArt = "https://jf.example/Items/al1/Images/Primary?maxWidth=600&quality=90&tag=tag1";
    expect(shareable(navidromeArt)).toBeNull();
    expect(shareable(plexArt)).toBeNull();
    expect(shareable("https://jf.example/x?ApiKey=tok")).toBeNull();
    expect(shareable(jellyfinArt)).toBe(jellyfinArt); // Jellyfin artwork carries no sign-in
    expect(shareable("https://i.scdn.co/image/abc")).toBe("https://i.scdn.co/image/abc");
    expect(shareable("not a url")).toBeNull();
    expect(shareable(null)).toBeNull();
    expect(httpsImage(navidromeArt)).toBeNull();
    expect(httpsImage(jellyfinArt)).toBe(jellyfinArt);
  });
});

describe("Subsonic answers", () => {
  it("become songs with signed stream and artwork addresses", () => {
    const song = sub.songTrack(navidrome, { id: "s1", title: "Placeholder", artist: "Someone", artistId: "ar1", album: "Record", albumId: "al1", coverArt: "mf-s1", duration: 218, artists: [{ id: "ar1", name: "Someone" }, { id: "ar2", name: "Guest" }] });
    expect(song).toMatchObject({ id: "s1", uri: "server:subsonic:track:s1", name: "Placeholder", durationMs: 218_000, explicit: false });
    expect(song.artists.map((a) => a.name)).toEqual(["Someone", "Guest"]);
    expect(song.album).toMatchObject({ id: "al1", uri: "server:subsonic:album:al1", image: "http://nas:4533/rest/getCoverArt.view?id=mf-s1&size=600&u=me&t=tok&s=salt&v=1.16.1&c=Carbon" });
    expect(sub.subsonic(navidrome).streamUrl("s 1")).toBe("http://nas:4533/rest/stream.view?id=s%201&u=me&t=tok&s=salt&v=1.16.1&c=Carbon");
  });

  it("survive older servers and missing fields", () => {
    const song = sub.songTrack(navidrome, { id: 7, title: "", artist: "Solo" });
    expect(song).toMatchObject({ id: "7", name: "Untitled", album: null, durationMs: 0 });
    expect(song.artists).toEqual([{ id: "", name: "Solo", uri: "" }]);
    expect(sub.albumCard(navidrome, { id: "al1", name: "Record", artist: "Someone", year: 2013 })).toMatchObject({ kind: "album", subtitle: "2013 · Someone", image: null, playUri: "server:subsonic:album:al1" });
    expect(sub.artistCard(navidrome, { id: "ar1", name: "Someone", albumCount: 1 }).subtitle).toBe("1 album");
    expect(sub.playlistCard(navidrome, { id: "p1", name: "Mix", songCount: 11 }).subtitle).toBe("11 songs");
  });

  it("ask the server through Rust and map what comes back", async () => {
    h.invoke.mockResolvedValueOnce({ album: { id: "al1", name: "Record", artist: "Someone", artistId: "ar1", year: 2013, song: [{ id: "s1", title: "One", duration: 60 }, { title: "no id" }] } });
    const album = await sub.subsonic(navidrome).album("al1");
    expect(h.invoke).toHaveBeenCalledWith("server_get", { kind: "subsonic", path: "getAlbum", params: [["id", "al1"]] });
    expect(album).toMatchObject({ name: "Record", year: "2013", uri: "server:subsonic:album:al1" });
    expect(album.tracks.map((t) => t.name)).toEqual(["One"]);
    h.invoke.mockResolvedValueOnce({ searchResult3: {} });
    expect(await sub.subsonic(navidrome).search("zz")).toEqual({ tracks: [], albums: [], artists: [] });
  });
});

describe("Jellyfin answers", () => {
  it("become songs, with ticks turned into milliseconds", () => {
    const song = jf.audioTrack(jelly, { Id: "t1", Name: "Placeholder", Type: "Audio", ArtistItems: [{ Name: "Someone", Id: "a1" }], Album: "Record", AlbumId: "al1", AlbumPrimaryImageTag: "tag1", RunTimeTicks: 1830508539 });
    expect(song).toMatchObject({ uri: "server:jellyfin:track:t1", durationMs: 183_051 });
    expect(song.artists).toEqual([{ id: "a1", name: "Someone", uri: "server:jellyfin:artist:a1" }]);
    expect(song.album?.image).toBe("https://jf.example/Items/al1/Images/Primary?maxWidth=600&quality=90&tag=tag1");
    expect(jf.imageUrl(jelly, "al1", undefined)).toBeNull();
  });

  it("stream what the audio element can play and ask the server to convert the rest", () => {
    const url = new URL(String(jf.jellyfin(jelly).streamUrl("t1")));
    expect(url.pathname).toBe("/Audio/t1/universal");
    expect(url.searchParams.get("ApiKey")).toBe("tok");
    expect(url.searchParams.get("TranscodingContainer")).toBe("mp3");
    expect(url.searchParams.get("Container")).toContain("flac");
  });

  it("split a search into songs, albums and artists", async () => {
    h.invoke.mockResolvedValueOnce({ Items: [{ Id: "t1", Name: "Song", Type: "Audio" }, { Id: "al1", Name: "Record", Type: "MusicAlbum", ProductionYear: 2024, AlbumArtist: "Someone" }, { Id: "a1", Name: "Someone", Type: "MusicArtist" }, { Type: "Audio" }] });
    const found = await jf.jellyfin(jelly).search("so");
    expect(h.invoke.mock.calls.at(-1)?.[1]).toMatchObject({ kind: "jellyfin", path: "Users/u1/Items" });
    expect([found.tracks.length, found.albums[0].subtitle, found.artists[0].title]).toEqual([1, "2024 · Someone", "Someone"]);
  });
});

describe("the server queue", () => {
  const made: FakeAudio[] = [];
  class FakeAudio extends EventTarget {
    src = "";
    volume = 1;
    preload = "";
    currentTime = 0;
    duration = NaN;
    error: unknown = null;
    /** Makes the next play() reject, the way the element does for a source it can't read. */
    static rejectNext = false;
    play = vi.fn(async () => {
      if (!FakeAudio.rejectNext) return;
      FakeAudio.rejectNext = false;
      throw new Error("no supported source");
    });
    pause = vi.fn();
    load = vi.fn();
    removeAttribute = vi.fn(() => void (this.src = ""));
    constructor() {
      super();
      made.push(this);
    }
  }
  const song = (id: string): Track => ({ id, uri: serverUri("subsonic", "track", id), name: id, artists: [], album: null, durationMs: 100_000, explicit: false });
  const address = (track: Track) => (isServerUri(track.uri) ? `http://nas/stream/${track.id}` : null);
  const resolve = { playable: (track: Track) => address(track) !== null, resolve: address };

  function host(repeat: "off" | "context" | "track" = "off") {
    const state = { shown: [] as string[], errors: [] as string[], syncs: [] as unknown[][], shuffle: false, repeat, context: null as string | null };
    return {
      state,
      volume: () => 0.3,
      repeat: () => state.repeat,
      setModes: (shuffle: boolean, r: typeof repeat) => void Object.assign(state, { shuffle, repeat: r }),
      show: (t: Track) => void state.shown.push(t.id),
      sync: (...args: unknown[]) => void state.syncs.push(args),
      fail: (m: string) => void state.errors.push(m),
      setContext: (uri: string | null) => void (state.context = uri),
    };
  }

  beforeEach(() => {
    made.length = 0;
    vi.stubGlobal("Audio", FakeAudio);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("plays only songs it has an address for, from the one that was picked", () => {
    const fake = host();
    const q = new StreamPlayback(fake, resolve);
    const spotify = { ...song("x"), uri: "spotify:track:6rqhFgbbKwnb9MLmUQDhG6" };
    q.play([song("a"), spotify, song("b")], 2, "server:subsonic:album:al1");
    expect(q.queue?.map((t) => t.id)).toEqual(["a", "b"]);
    expect([q.index, made[0].src, made[0].volume, fake.state.context]).toEqual([1, "http://nas/stream/b", 0.3, "server:subsonic:album:al1"]);
    expect(fake.state.syncs.at(-1)).toEqual([false, 0, 100_000, true]); // loading: the clock holds
    expect(q.add(spotify)).toBe(false);
  });

  it("moves on when a song ends, loops one on repeat-one, and stops at the end of the queue", () => {
    const fake = host();
    const q = new StreamPlayback(fake, resolve);
    q.play([song("a"), song("b")]);
    made[0].dispatchEvent(new Event("ended"));
    expect(q.index).toBe(1);
    fake.state.repeat = "track";
    made[0].dispatchEvent(new Event("ended"));
    expect(fake.state.shown).toEqual(["a", "b", "b"]);
    fake.state.repeat = "off";
    made[0].dispatchEvent(new Event("ended"));
    expect(fake.state.syncs.at(-1)).toEqual([true, 0]);
    q.toggle(); // Play after the end starts over
    expect(q.index).toBe(0);
  });

  it("reports the element's own position and length, and restarts on Previous once into a song", () => {
    const fake = host();
    const q = new StreamPlayback(fake, resolve);
    q.play([song("a"), song("b")], 1);
    Object.assign(made[0], { currentTime: 12.5, duration: 200 });
    made[0].dispatchEvent(new Event("playing"));
    expect(fake.state.syncs.at(-1)).toEqual([false, 12_500, 200_000, false]);
    q.previous();
    expect([q.index, made[0].currentTime]).toEqual([1, 0]);
    q.previous();
    expect(q.index).toBe(0);
  });

  it("skips a song that won't load, and gives up after a few in a row", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fake = host("context");
    const q = new StreamPlayback(fake, resolve);
    q.play([song("a"), song("b"), song("c"), song("d")]);
    for (let i = 0; i < 3; i++) made[0].dispatchEvent(new Event("error"));
    expect(fake.state.errors[0]).toMatch(/“a” couldn't be played./);
    expect(q.index).toBe(2); // skipped a and b, stopped on c
    expect(fake.state.syncs.at(-1)).toEqual([true, 0]);
  });

  it("waits for an address that has to be fetched, and drops one that arrives for a song already skipped", async () => {
    const fake = host();
    const waiting: ((url: string) => void)[] = [];
    const q = new StreamPlayback(fake, { playable: () => true, resolve: () => new Promise<string>((r) => waiting.push(r)) });
    q.play([song("a"), song("b")]);
    q.next(); // before a's address came back
    waiting[0]("http://signed/a");
    await Promise.resolve();
    expect(made).toHaveLength(0); // a's late address loads nothing
    waiting[1]("http://signed/b");
    await vi.waitFor(() => expect(made[0]?.src).toBe("http://signed/b"));
    expect(fake.state.shown).toEqual(["a", "b"]);
  });

  it("hands a segmented stream to the HLS player instead of the element, and lets go of it when stopped", async () => {
    const hls = { loadSource: vi.fn(), attachMedia: vi.fn(), on: vi.fn(), destroy: vi.fn() };
    vi.doMock("hls.js", () => ({ default: Object.assign(vi.fn(function () { return hls; }), { isSupported: () => true, Events: { ERROR: "hlsError" } }) }));
    const fake = host();
    const q = new StreamPlayback(fake, { playable: () => true, resolve: () => "https://playback.media-streaming.soundcloud.cloud/abc/playlist.m3u8?Policy=x" });
    q.play([song("a")]);
    await vi.waitFor(() => expect(hls.loadSource).toHaveBeenCalledWith("https://playback.media-streaming.soundcloud.cloud/abc/playlist.m3u8?Policy=x"));
    expect(hls.attachMedia).toHaveBeenCalledWith(made[0]);
    expect(made[0].src).toBe(""); // the element never gets the list itself
    await q.stop();
    expect(hls.destroy).toHaveBeenCalled();
    vi.doUnmock("hls.js");
  });

  it("blames a song that won't load once, even though the element reports it twice", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fake = host();
    const q = new StreamPlayback(fake, resolve);
    FakeAudio.rejectNext = true;
    q.play([song("a"), song("b"), song("c")]); // a's play() will reject…
    made[0].dispatchEvent(new Event("error")); // …and the element says so with an event too: on to b, once
    await Promise.resolve();
    await Promise.resolve();
    expect([q.index, fake.state.errors.length]).toEqual([1, 1]);
    made[0].dispatchEvent(new Event("error")); // a real failure of b still counts
    expect(q.index).toBe(2);
  });

  it("asks for a fresh address when a song is played again after a long pause, and picks up where it was", () => {
    vi.useFakeTimers({ toFake: ["performance"] });
    const fake = host();
    let asked = 0;
    const q = new StreamPlayback(fake, { playable: () => true, resolve: (t) => `http://signed/${t.id}?n=${++asked}` });
    q.play([song("a")]);
    made[0].currentTime = 42;
    q.toggle(); // pause
    vi.advanceTimersByTime(11 * 60_000);
    q.toggle(); // play: the old address has expired
    expect([made[0].src, made[0].currentTime, asked]).toEqual(["http://signed/a?n=2", 42, 2]);
    vi.useRealTimers();
  });

  it("ignores the last song's late events while the next song's address is on its way", async () => {
    const fake = host();
    let release: (url: string) => void = () => {};
    const q = new StreamPlayback(fake, { playable: () => true, resolve: (t) => (t.id === "a" ? "http://signed/a" : new Promise<string>((r) => (release = r))) });
    q.play([song("a"), song("b")]);
    Object.assign(made[0], { currentTime: 27, duration: 331 });
    made[0].dispatchEvent(new Event("playing"));
    q.next(); // b's address is being fetched; the element still holds a
    const before = fake.state.syncs.length;
    for (const type of ["timeupdate", "seeked", "durationchange", "ended"]) made[0].dispatchEvent(new Event(type));
    expect(fake.state.syncs).toHaveLength(before); // nothing of a's is reported under b's name
    expect([q.index, fake.state.syncs.at(-1)]).toEqual([1, [false, 0, 100_000, true]]);
    release("http://signed/b");
    await vi.waitFor(() => expect(made[0].src).toBe("http://signed/b"));
    Object.assign(made[0], { currentTime: 1, duration: 200 });
    made[0].dispatchEvent(new Event("playing"));
    expect(fake.state.syncs.at(-1)).toEqual([false, 1_000, 200_000, false]);
  });

  it("shuffles from a random song, restores the order, and lets go of the stream when stopped", async () => {
    const fake = host();
    const q = new StreamPlayback(fake, resolve);
    const list = [song("a"), song("b"), song("c")];
    q.playShuffled(list, "ctx");
    expect(fake.state.shuffle).toBe(true);
    const current = q.queue![q.index];
    q.toggleShuffle(false);
    expect(q.queue).toEqual(list);
    expect(q.queue![q.index].id).toBe(current.id);
    await q.stop();
    expect([q.active, made[0].src, fake.state.context]).toEqual([false, "", null]);
    made[0].dispatchEvent(new Event("ended")); // late events change nothing
    expect(q.active).toBe(false);
  });
});

describe("Plex answers", () => {
  const plexInfo = { kind: "plex" as const, url: "http://nas:32400", username: "Plex", userId: "", mediaQuery: "X-Plex-Token=tok" };

  it("become songs keyed by Plex's own id, streaming the file Plex lists, signed with the token", async () => {
    const px = await import("./plex");
    const raw = { ratingKey: "12", title: "Placeholder", grandparentTitle: "Someone", grandparentRatingKey: "3", parentTitle: "Record", parentRatingKey: "7", parentThumb: "/library/metadata/7/thumb/1", duration: 183051, Media: [{ Part: [{ key: "/library/parts/99/1700/file.flac" }] }] };
    const song = px.songTrack(plexInfo, raw);
    expect(song).toMatchObject({ id: "12", name: "Placeholder", durationMs: 183_051, uri: "server:plex:track:12" });
    expect(song.artists).toEqual([{ id: "3", name: "Someone", uri: "server:plex:artist:3" }]);
    expect(song.album).toMatchObject({ id: "7", uri: "server:plex:album:7", image: "http://nas:32400/library/metadata/7/thumb/1?X-Plex-Token=tok" });
    expect(px.plex(plexInfo).streamUrl("12")).toBe("http://nas:32400/library/parts/99/1700/file.flac?X-Plex-Token=tok");
    expect(px.songTrack(plexInfo, { ...raw, originalTitle: "Guest" }).artists[0]).toEqual({ id: "", name: "Guest", uri: "" });
    expect(px.signed(plexInfo, "https://evil.example/x")).toBeNull();
  });

  it("ask Plex for the file of a song that didn't come from a list (history, a bookmark)", async () => {
    const px = await import("./plex");
    h.invoke.mockReset();
    h.invoke.mockResolvedValueOnce({ MediaContainer: { Metadata: [{ ratingKey: "88", Media: [{ Part: [{ key: "/library/parts/5/1/a.mp3" }] }] }] } });
    expect(await px.plex(plexInfo).streamUrl("88")).toBe("http://nas:32400/library/parts/5/1/a.mp3?X-Plex-Token=tok");
    expect(h.invoke).toHaveBeenCalledWith("server_get", { kind: "plex", path: "library/metadata/88", params: [] });
    h.invoke.mockResolvedValueOnce({ MediaContainer: { Metadata: [] } });
    expect(await px.plex(plexInfo).streamUrl("gone")).toBeNull();
  });

  it("find the music section, then read albums from it", async () => {
    const px = await import("./plex");
    h.invoke.mockReset();
    h.invoke.mockResolvedValueOnce({ MediaContainer: { Directory: [{ type: "movie", key: "1" }, { type: "artist", key: "4" }] } });
    h.invoke.mockResolvedValueOnce({ MediaContainer: { Metadata: [{ ratingKey: "9", title: "Someone", thumb: "/t/9" }] } });
    const artists = await px.plex(plexInfo).artists();
    expect(h.invoke.mock.calls[1][1]).toMatchObject({ kind: "plex", path: "library/sections/4/all" });
    expect(artists[0]).toMatchObject({ kind: "artist", title: "Someone", playUri: "server:plex:artist:9" });
    h.invoke.mockResolvedValueOnce({ MediaContainer: { Directory: [{ type: "movie", key: "1" }] } });
    await expect(px.plex(plexInfo).artists()).rejects.toThrow(/no music library/);
  });
});
