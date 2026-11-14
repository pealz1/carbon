// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "$lib/spotify/types";
import type { EmbedEvent } from "$lib/youtube/embed";

const h = vi.hoisted(() => ({ emit: (_: EmbedEvent) => {} }));

vi.mock("$lib/native", () => ({ reportPlayback: vi.fn(async () => {}) }));
vi.mock("$lib/auth", () => ({ getAccessToken: vi.fn(async () => "token"), withTimeout: <T>(p: Promise<T>) => p }));
vi.mock("$lib/spotify/endpoints", () => ({ setShuffle: vi.fn(), playOn: vi.fn(), addToQueue: vi.fn() }));
vi.mock("$lib/youtube/api", () => ({ radio: vi.fn(async () => ({ tracks: [], lyricsId: null })), playability: vi.fn() }));
vi.mock("$lib/youtube/embed", async (actual) => ({
  ...(await actual<typeof import("$lib/youtube/embed")>()),
  embed: {
    onEvent: (handler: (e: EmbedEvent) => void) => void (h.emit = handler),
    load: () => {},
    play: () => {},
    pause: () => {},
    seek: () => {},
    setVolume: () => {},
    halt: async () => {},
  },
}));

const native = await import("$lib/native");
const { player } = await import("./player.svelte");

type Listener = (payload: unknown) => void;
let listeners: Record<string, Listener> = {};
const sdkTrack = { id: "t1", uri: "spotify:track:t1", name: "Song", type: "track", duration_ms: 200_000, artists: [], album: { name: "A", uri: "spotify:album:a", images: [] } };
const state = (position: number, extra: Record<string, unknown> = {}) => ({
  context: { uri: "spotify:album:a" },
  paused: false,
  position,
  duration: 200_000,
  shuffle: false,
  repeat_mode: 0,
  track_window: { current_track: sdkTrack, next_tracks: [], previous_tracks: [] },
  ...extra,
});

class FakeSdk {
  addListener(event: string, cb: Listener) {
    listeners[event] = cb;
    return true;
  }
  async connect() {
    queueMicrotask(() => listeners.ready?.({ device_id: "dev" }));
    return true;
  }
  pause = vi.fn(async () => {});
  setVolume = vi.fn(async () => {});
  getCurrentState = vi.fn(async () => null);
  disconnect() {}
}

class FakeAudio extends EventTarget {
  src = "";
  volume = 1;
  preload = "";
  play = vi.fn(async () => {});
  pause = vi.fn();
  load = vi.fn();
  removeAttribute = vi.fn();
}

const yt = (id: string): Track => ({ id, uri: `ytm:video:${id}`, name: id, artists: [], album: null, durationMs: 200_000, explicit: false });
const reports = () => vi.mocked(native.reportPlayback).mock.calls.length;

describe("the playback clock", () => {
  beforeAll(async () => {
    (window as unknown as { Spotify: unknown }).Spotify = { Player: FakeSdk };
    void player.start();
    await vi.waitFor(() => expect(document.head.querySelector("script")).not.toBeNull());
    window.onSpotifyWebPlaybackSDKReady?.();
    await vi.waitFor(() => expect(player.status).toBe("ready"));
  });

  beforeEach(() => vi.useFakeTimers({ toFake: ["performance"] }));
  afterEach(() => vi.useRealTimers());

  it("holds still while Spotify is still loading the song, then runs", () => {
    listeners.player_state_changed(state(0, { loading: true }));
    vi.advanceTimersByTime(900);
    expect(player.position()).toBe(0);
    listeners.player_state_changed(state(0, { loading: false }));
    vi.advanceTimersByTime(900);
    expect(player.position()).toBe(900);
  });

  it("lets the clock run again when Spotify never says loading ended", async () => {
    vi.useFakeTimers({ toFake: ["performance", "setTimeout", "clearTimeout"] });
    listeners.player_state_changed(state(5_000, { loading: true }));
    await vi.advanceTimersByTimeAsync(9_500);
    expect(player.position()).toBe(5_000); // still asking
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(player.position()).toBeGreaterThanOrEqual(7_000); // from where it was held, not ten seconds ahead
    expect(player.position()).toBeLessThan(8_000);
    listeners.player_state_changed(state(0, { loading: false }));
  });

  it("holds still while YouTube loads or buffers, and doesn't jump back when it resumes", async () => {
    await player.playQueue([yt("aaaaaaaaaaa")]);
    vi.advanceTimersByTime(1500);
    expect(player.paused).toBe(false);
    expect(player.position()).toBe(0); // the video hasn't started
    h.emit({ state: "playing", timeS: 0 });
    vi.advanceTimersByTime(700);
    expect(player.position()).toBe(700);
    h.emit({ state: "buffering" }); // carries no time of its own
    vi.advanceTimersByTime(2000);
    expect(player.position()).toBe(700);
    h.emit({ state: "playing" });
    vi.advanceTimersByTime(300);
    expect(player.position()).toBe(1000);
  });

  it("hands over to a radio station and back, reporting it as radio with nothing up next", async () => {
    vi.stubGlobal("Audio", FakeAudio);
    const station = { id: "d28420a4-eccf-47a2-ace1-088c7e7cb7e0", name: "Jazz FM", streamUrl: "https://s.example/a", icon: null, tags: ["jazz"], country: "GB", codec: "MP3", bitrate: 128 };
    await player.playStation(station);
    expect([player.source, player.track?.name, player.upNext]).toEqual(["radio", "Jazz FM", []]);
    expect(vi.mocked(native.reportPlayback).mock.calls.at(-1)?.[0]).toMatchObject({ source: "radio", title: "Jazz FM", durationMs: 0, positionMs: 0 });
    expect(await player.addToQueue("spotify:track:6rqhFgbbKwnb9MLmUQDhG6")).toBe(false);
    expect(player.error).toMatch(/radio station plays on its own/i);
    await player.playQueue([yt("bbbbbbbbbbb")]);
    expect(player.source).toBe("youtube");
    vi.unstubAllGlobals();
  });

  it("keeps a server's signed artwork address away from the Rust core (Discord, the phone remote)", async () => {
    vi.stubGlobal("Audio", FakeAudio);
    const { serverSession } = await import("$lib/servers/session.svelte");
    serverSession.list = [{ kind: "subsonic", url: "https://music.example", username: "me", userId: "", mediaQuery: "u=me&t=tok&s=salt&v=1.16.1&c=Carbon" }];
    const image = "https://music.example/rest/getCoverArt.view?id=al-1&size=600&u=me&t=tok&s=salt&v=1.16.1&c=Carbon";
    const song: Track = { id: "s1", uri: "server:subsonic:track:s1", name: "Placeholder", artists: [], album: { id: "al1", name: "Record", uri: "server:subsonic:album:al1", image }, durationMs: 100_000, explicit: false };
    await player.playQueue([song]);
    expect(player.source).toBe("server");
    expect(player.artwork).toBe(image); // still shown in Carbon's own window
    const reported = vi.mocked(native.reportPlayback).mock.calls.at(-1)?.[0];
    expect(reported).toMatchObject({ title: "Placeholder", source: "server", artworkUrl: null });
    expect(JSON.stringify(vi.mocked(native.reportPlayback).mock.calls)).not.toContain("t=tok");
    await player.playQueue([yt("ccccccccccc")]);
    vi.unstubAllGlobals();
  });

  it("tells the Rust core about changes and seeks, not every position tick", () => {
    h.emit({ state: "playing", timeS: 10 });
    const before = reports();
    for (let i = 1; i <= 12; i++) {
      vi.advanceTimersByTime(250);
      h.emit({ timeS: 10 + i * 0.25 });
    }
    expect(reports()).toBe(before); // three seconds of ticks, nothing new to say
    vi.advanceTimersByTime(2500);
    h.emit({ timeS: 15.5 });
    expect(reports()).toBe(before + 1); // the steady refresh
    h.emit({ timeS: 90 });
    expect(reports()).toBe(before + 2); // a seek
    h.emit({ state: "paused" });
    expect(reports()).toBe(before + 3);
    h.emit({ state: "playing", timeS: 90 });
    const playing = reports();
    void player.seek(30_000); // the clock already sits at 30 s, so the backend's answer is no jump
    h.emit({ timeS: 30 });
    expect(reports()).toBe(playing + 1); // still news for the media overlay and the remote
    h.emit({ state: "buffering" });
    expect(reports()).toBe(playing + 2); // so is a stall, and its end
    h.emit({ state: "playing" });
    expect(reports()).toBe(playing + 3);
  });
});
