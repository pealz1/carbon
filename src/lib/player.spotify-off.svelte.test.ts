// @vitest-environment jsdom
// With YouTube Music only, the player never loads Spotify's SDK or calls Spotify's API.
import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/native", () => ({ reportPlayback: vi.fn(async () => {}) }));
vi.mock("$lib/auth", () => ({ getAccessToken: vi.fn(async () => "token"), withTimeout: <T>(p: Promise<T>) => p }));
vi.mock("$lib/spotify/endpoints", () => ({ playOn: vi.fn(), setShuffle: vi.fn(), setRepeat: vi.fn(), addToQueue: vi.fn(), lastPlayback: vi.fn(), recentlyPlayed: vi.fn() }));

const sp = await import("$lib/spotify/endpoints");
const { player } = await import("./player.svelte");

describe("player with Spotify off", () => {
  it("doesn't load Spotify's SDK or call its API", async () => {
    player.spotifyEnabled = false;
    await player.start();
    expect(await player.togglePlay()).toBe(false);
    expect(player.error).toBe("Pick something to play first.");
    await player.playTracks(["spotify:track:6rqhFgbbKwnb9MLmUQDhG6"]);
    await player.next();
    expect(document.head.querySelector("script")).toBeNull();
    expect(player.status).toBe("idle");
    for (const call of [sp.playOn, sp.lastPlayback, sp.recentlyPlayed]) expect(call).not.toHaveBeenCalled();
  });
});
