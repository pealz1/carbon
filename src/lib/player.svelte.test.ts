// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/native", () => ({ reportPlayback: vi.fn(async () => {}) }));
vi.mock("$lib/auth", () => ({ getAccessToken: vi.fn(async () => "token"), withTimeout: <T>(p: Promise<T>) => p }));
vi.mock("$lib/spotify/endpoints", () => ({ setShuffle: vi.fn(), playOn: vi.fn(), addToQueue: vi.fn() }));

const sp = await import("$lib/spotify/endpoints");
const { player } = await import("./player.svelte");

type Listener = (payload: unknown) => void;
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

let listeners: Record<string, Listener> = {};
const getCurrentState = vi.fn();

class FakeSdk {
  addListener(event: string, cb: Listener) {
    listeners[event] = cb;
    return true;
  }
  async connect() {
    queueMicrotask(() => listeners.ready?.({ device_id: "dev" }));
    return true;
  }
  getCurrentState = getCurrentState;
  seek = vi.fn(async () => {});
  disconnect() {}
}

describe("player additions", () => {
  beforeAll(async () => {
    listeners = {};
    (window as unknown as { Spotify: unknown }).Spotify = { Player: FakeSdk };
    void player.start();
    await vi.waitFor(() => expect(document.head.querySelector("script")).not.toBeNull());
    window.onSpotifyWebPlaybackSDKReady?.();
    await vi.waitFor(() => expect(player.status).toBe("ready"));
    listeners.player_state_changed(state(10_000));
  });

  beforeEach(() => {
    vi.mocked(sp.setShuffle).mockReset();
    vi.mocked(sp.playOn).mockReset();
  });

  it("turns shuffle on before playing when Carbon is the active device", async () => {
    vi.mocked(sp.setShuffle).mockResolvedValue(undefined);
    expect(await player.shufflePlay("spotify:playlist:p", 30)).toBe(true);
    expect(sp.setShuffle).toHaveBeenCalledTimes(1);
    expect(sp.playOn).toHaveBeenCalledWith("dev", { context_uri: "spotify:playlist:p" });
  });

  it("starts on a random song and shuffles afterwards when Spotify refuses at first", async () => {
    vi.mocked(sp.setShuffle).mockRejectedValueOnce(new Error("404")).mockResolvedValueOnce(undefined);
    expect(await player.shufflePlay("spotify:playlist:p", 30)).toBe(true);
    const body = vi.mocked(sp.playOn).mock.calls[0][1] as { offset: { position: number } };
    expect(body.offset.position).toBeGreaterThanOrEqual(0);
    expect(body.offset.position).toBeLessThan(30);
    expect(sp.setShuffle).toHaveBeenCalledTimes(2);
  });

  it("reports failure through the player's error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(sp.setShuffle).mockRejectedValue(new Error("no device"));
    vi.mocked(sp.playOn).mockRejectedValue(new Error("Spotify said no"));
    expect(await player.shufflePlay("spotify:artist:x")).toBe(false);
    expect(player.error).toBe("Spotify said no");
  });

  it("re-reads the position from the SDK's local state, ignoring other tracks", async () => {
    getCurrentState.mockResolvedValueOnce(state(42_000, { paused: true }));
    await player.syncPosition();
    expect(player.position()).toBe(42_000);
    expect(player.paused).toBe(true);
    getCurrentState.mockResolvedValueOnce(state(99_000, { track_window: { current_track: { ...sdkTrack, uri: "spotify:track:other" } } }));
    await player.syncPosition();
    expect(player.position()).toBe(42_000);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    getCurrentState.mockRejectedValueOnce(new Error("sdk gone"));
    await player.syncPosition();
    expect(player.position()).toBe(42_000);
  });

  it("resyncs right after a seek, but not back to where it was", async () => {
    getCurrentState.mockResolvedValueOnce(state(61_000, { paused: true }));
    await player.seek(60_000);
    expect(player.position()).toBe(61_000);
    getCurrentState.mockResolvedValueOnce(state(10_000, { paused: true }));
    await player.seek(90_000);
    expect(player.position()).toBe(90_000);
  });

  // Last: it leaves a Carbon queue running.
  it("says so when Spotify won't take a song into a Carbon queue", async () => {
    const track = (uri: string) => ({ id: uri, uri, name: uri, artists: [], album: null, durationMs: 1000, explicit: false });
    expect(await player.addToQueue("local:abc", track("local:abc"))).toBe(true);
    expect(player.upNext?.map((t) => t.uri)).toEqual(["local:abc"]);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(sp.addToQueue).mockRejectedValueOnce(new Error("Spotify said no"));
    expect(await player.addToQueue("spotify:track:t2", track("spotify:track:t2"))).toBe(false);
    expect(player.error).toBe("Spotify said no");
    expect(player.upNext?.map((t) => t.uri)).toEqual(["local:abc"]);
  });

  it("plays Carbon's own shuffle of a list it could read, with shuffle shown on", async () => {
    const tracks = ["a", "b", "c", "d"].map((id) => ({ id, uri: `spotify:track:${id}`, name: id, artists: [], album: null, durationMs: 1000, explicit: false }));
    const source = vi.fn(async () => tracks);
    player.shuffleSource = source;
    expect(await player.shufflePlay("spotify:album:x", 4)).toBe(true);
    expect(source).toHaveBeenCalledWith("spotify:album:x");
    const body = vi.mocked(sp.playOn).mock.calls[0][1] as { uris: string[] };
    expect([...body.uris].sort()).toEqual(tracks.map((t) => t.uri));
    expect(sp.setShuffle).not.toHaveBeenCalled(); // Spotify's own shuffle stays out of it
    expect(player.shuffle).toBe(true);
    expect(player.upNext).toHaveLength(3);
    player.shuffleSource = null;
  });
});
