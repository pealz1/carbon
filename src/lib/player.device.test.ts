// @vitest-environment jsdom
// Spotify forgets an SDK device after sleep, network changes or a reconnect; the player must follow.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "$lib/spotify/api";

vi.mock("$lib/native", () => ({ reportPlayback: vi.fn(async () => {}) }));
vi.mock("$lib/auth", () => ({
  getAccessToken: vi.fn(async () => "token"),
  refreshAccessToken: vi.fn(async () => "fresh"),
  withTimeout: <T>(p: Promise<T>) => p,
}));
vi.mock("$lib/spotify/endpoints", () => ({ playOn: vi.fn(), transferTo: vi.fn(), setShuffle: vi.fn(), setRepeat: vi.fn(), addToQueue: vi.fn() }));

const sp = await import("$lib/spotify/endpoints");
const { toasts } = await import("$lib/toast.svelte");
const { player } = await import("./player.svelte");

type Listener = (payload: unknown) => void;
const listeners: Record<string, Listener> = {};
let connects = 0;
let disconnects = 0;

/** Registers under a new id on every connect, like the real SDK after a reconnect. */
class FakeSdk {
  addListener(event: string, cb: Listener) {
    listeners[event] = cb;
    return true;
  }
  async connect() {
    connects += 1;
    const id = `dev-${connects}`;
    queueMicrotask(() => listeners.ready?.({ device_id: id }));
    return true;
  }
  disconnect() {
    disconnects += 1;
  }
}

const deviceGone = () => new ApiError(404, "Device not found");
const play = () => player.playContext("spotify:album:a");

describe("player device tracking", () => {
  beforeAll(async () => {
    (window as unknown as { Spotify: unknown }).Spotify = { Player: FakeSdk };
    void player.start();
    await vi.waitFor(() => expect(document.head.querySelector("script")).not.toBeNull());
    window.onSpotifyWebPlaybackSDKReady?.();
    await vi.waitFor(() => expect(player.status).toBe("ready"));
  });

  beforeEach(() => {
    vi.mocked(sp.playOn).mockReset().mockResolvedValue(null);
    vi.mocked(sp.transferTo).mockReset().mockResolvedValue(null);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("plays on the id from the latest ready event, not the first", async () => {
    listeners.ready({ device_id: "dev-after-sleep" });
    expect(await play()).toBe(true);
    expect(sp.playOn).toHaveBeenCalledWith("dev-after-sleep", { context_uri: "spotify:album:a" });
  });

  it("waits for the next ready after not_ready, ignoring stale not_ready news", async () => {
    listeners.not_ready({ device_id: "some-old-id" });
    expect(player.status).toBe("ready");
    listeners.not_ready({ device_id: "dev-after-sleep" });
    expect(player.status).toBe("connecting");
    const pending = play();
    await Promise.resolve();
    expect(sp.playOn).not.toHaveBeenCalled();
    listeners.ready({ device_id: "dev-back" });
    expect(await pending).toBe(true);
    expect(sp.playOn).toHaveBeenCalledWith("dev-back", expect.anything());
  });

  it("gives up waiting for a ready device after a bounded time, with one reconnect", async () => {
    vi.useFakeTimers();
    try {
      listeners.not_ready({ device_id: "dev-back" });
      const silentConnect = vi.spyOn(FakeSdk.prototype, "connect").mockImplementation(async () => ((connects += 1), true));
      const pending = play();
      await vi.advanceTimersByTimeAsync(25_000);
      expect(await pending).toBe(false);
      expect(silentConnect).toHaveBeenCalledTimes(1);
      expect(sp.playOn).not.toHaveBeenCalled();
      expect(player.error).toBeTruthy();
      silentConnect.mockRestore();
    } finally {
      vi.useRealTimers();
    }
    // Recover for the next tests.
    listeners.ready({ device_id: "dev-recovered" });
  });

  it("reconnects, transfers and retries once when Spotify forgot the device", async () => {
    vi.mocked(sp.playOn).mockRejectedValueOnce(deviceGone());
    const before = { connects, disconnects };
    expect(await play()).toBe(true);
    const fresh = `dev-${connects}`;
    expect(connects - before.connects).toBe(1);
    expect(disconnects - before.disconnects).toBe(1);
    expect(sp.transferTo).toHaveBeenCalledWith(fresh, false);
    expect(vi.mocked(sp.playOn).mock.calls.map(([id]) => id)).toEqual(["dev-recovered", fresh]);
    expect(toasts.items.some((t) => /Reconnected the player and tried again/.test(t.text))).toBe(true);
  });

  it("stops after one retry and says so when the new device fails too", async () => {
    vi.mocked(sp.playOn).mockRejectedValue(deviceGone());
    const before = connects;
    expect(await play()).toBe(false);
    expect(sp.playOn).toHaveBeenCalledTimes(2);
    expect(connects - before).toBe(1);
    expect(player.error).toBeTruthy();
  });

  it("does not reconnect for other errors", async () => {
    vi.mocked(sp.playOn).mockRejectedValue(new ApiError(403, "Player command failed: Premium required", "PREMIUM_REQUIRED"));
    const before = connects;
    expect(await play()).toBe(false);
    expect(sp.playOn).toHaveBeenCalledTimes(1);
    expect(connects).toBe(before);
  });
});
