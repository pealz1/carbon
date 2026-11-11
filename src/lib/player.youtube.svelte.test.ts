// @vitest-environment jsdom
// Hand-offs between Spotify and YouTube Music in the Player facade: strictly one at a time, and
// never one queue for both.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "$lib/spotify/types";

const h = vi.hoisted(() => ({ log: [] as string[] }));

vi.mock("$lib/native", () => ({ reportPlayback: vi.fn(async () => {}) }));
vi.mock("$lib/auth", () => ({ getAccessToken: vi.fn(async () => "token") }));
vi.mock("$lib/spotify/endpoints", () => ({
  setShuffle: vi.fn(async () => {}),
  setRepeat: vi.fn(async () => {}),
  playOn: vi.fn(async () => void h.log.push("spotify.play")),
  addToQueue: vi.fn(async () => {}),
}));
vi.mock("$lib/youtube/api", () => ({ radio: vi.fn(async () => ({ tracks: [], lyricsId: null })), playability: vi.fn() }));
vi.mock("$lib/youtube/embed", async (actual) => ({
  ...(await actual<typeof import("$lib/youtube/embed")>()),
  embed: {
    onEvent: () => () => {},
    load: (id: string) => h.log.push(`youtube.load ${id}`),
    play: () => {},
    pause: () => {},
    seek: () => {},
    setVolume: () => {},
    halt: async () => {
      h.log.push("youtube.halt:start");
      await new Promise((r) => setTimeout(r, 5));
      h.log.push("youtube.halt:done");
    },
  },
}));

const { player } = await import("./player.svelte");
const { SEPARATE_SERVICES } = await import("./sources");

type Listener = (payload: unknown) => void;
let listeners: Record<string, Listener> = {};
const sdkTrack = { id: "t1", uri: "spotify:track:t1", name: "Spotify song", type: "track", duration_ms: 200_000, artists: [], album: { name: "A", uri: "spotify:album:a", images: [] } };
const state = (paused: boolean) => ({
  context: { uri: "spotify:album:a" },
  paused,
  position: 1000,
  duration: 200_000,
  shuffle: false,
  repeat_mode: 0,
  track_window: { current_track: sdkTrack, next_tracks: [], previous_tracks: [] },
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
  pause = vi.fn(async () => {
    h.log.push("spotify.pause:start");
    await new Promise((r) => setTimeout(r, 5));
    h.log.push("spotify.pause:done");
  });
  setVolume = vi.fn(async () => {});
  getCurrentState = vi.fn(async () => null);
  disconnect() {}
}

const yt = (id: string): Track => ({ id, uri: `ytm:video:${id}`, name: `YouTube ${id}`, artists: [], album: null, durationMs: 200_000, explicit: false });
const spotifyUri = "spotify:track:6rqhFgbbKwnb9MLmUQDhG6";

describe("Spotify and YouTube Music hand-offs", () => {
  beforeAll(async () => {
    (window as unknown as { Spotify: unknown }).Spotify = { Player: FakeSdk };
    void player.start();
    await vi.waitFor(() => expect(document.head.querySelector("script")).not.toBeNull());
    window.onSpotifyWebPlaybackSDKReady?.();
    await vi.waitFor(() => expect(player.status).toBe("ready"));
  });

  beforeEach(() => {
    h.log = [];
    player.error = null;
  });

  it("pauses Spotify, and waits for it, before YouTube Music starts", async () => {
    listeners.player_state_changed(state(false));
    expect(player.source).toBe("spotify");
    await player.playTracks(["ytm:video:aaaaaaaaaaa"], 0, [yt("aaaaaaaaaaa")]);
    expect(h.log).toEqual(["spotify.pause:start", "spotify.pause:done", "youtube.load aaaaaaaaaaa"]);
    expect(player.source).toBe("youtube");
    expect(player.track?.name).toBe("YouTube aaaaaaaaaaa");
  });

  it("ignores Spotify's player states while YouTube Music plays", () => {
    listeners.player_state_changed(state(true));
    expect(player.track?.name).toBe("YouTube aaaaaaaaaaa");
  });

  it("refuses to queue a Spotify song behind YouTube Music", async () => {
    expect(await player.addToQueue(spotifyUri)).toBe(false);
    expect(player.error).toBe(SEPARATE_SERVICES);
    expect(player.upNext).toEqual([]);
  });

  it("refuses a list that mixes both services", async () => {
    await player.playQueue([yt("bbbbbbbbbbb"), { ...yt("x"), uri: spotifyUri }]);
    expect(player.error).toBe(SEPARATE_SERVICES);
    expect(h.log).toEqual([]);
  });

  it("stops YouTube Music, and waits for it, before Spotify plays", async () => {
    await player.playTracks([spotifyUri]);
    expect(h.log).toEqual(["youtube.halt:start", "youtube.halt:done", "spotify.play"]);
    expect(player.source).toBe("spotify");
  });
});
