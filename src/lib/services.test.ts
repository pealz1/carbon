// Which screens, backends and pages are live for each choice of services.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  settings: { services: null as { spotify: boolean; youtube: boolean } | null },
  token: null as string | null,
  session: { status: "booting" as string, boot: vi.fn(async () => {}), signOut: vi.fn(async () => {}) },
  youtube: { boot: vi.fn(async () => {}), signOut: vi.fn(async () => {}) },
  player: { spotifyEnabled: true },
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => h.token) }));
vi.mock("$lib/preferences.svelte", () => ({
  prefs: {
    load: vi.fn(async () => h.settings),
    update: vi.fn(async (patch: object) => ((h.settings = { ...h.settings, ...patch }), true)),
  },
}));
vi.mock("$lib/session.svelte", () => ({ session: h.session }));
vi.mock("$lib/youtube/session.svelte", () => ({ youtube: h.youtube }));
vi.mock("$lib/player.svelte", () => ({ player: h.player }));

const { activeFor, redirectFor, screenFor, services } = await import("./services.svelte");

const SPOTIFY = { spotify: true, youtube: false };
const YOUTUBE = { spotify: false, youtube: true };
const BOTH = { spotify: true, youtube: true };

describe("which screen shows", () => {
  it("asks once, before anything starts", () => {
    expect(screenFor(undefined, "booting")).toBe("booting");
    expect(screenFor(null, "booting")).toBe("choose");
  });

  it("keeps Spotify-only as it was: no app until Spotify is signed in", () => {
    expect(screenFor(SPOTIFY, "booting")).toBe("booting");
    expect(screenFor(SPOTIFY, "needs-client-id")).toBe("spotify-setup");
    expect(screenFor(SPOTIFY, "signed-out")).toBe("spotify-setup");
    expect(screenFor(SPOTIFY, "signed-in")).toBe("app");
  });

  it("opens straight away with YouTube Music only, whatever Spotify's state", () => {
    for (const status of ["booting", "needs-client-id", "signed-out", "signed-in"] as const) expect(screenFor(YOUTUBE, status)).toBe("app");
  });

  it("with both, shows Spotify's setup only right after choosing it", () => {
    expect(screenFor(BOTH, "needs-client-id", true)).toBe("spotify-setup");
    expect(screenFor(BOTH, "needs-client-id")).toBe("app");
    expect(screenFor(BOTH, "signed-out")).toBe("app");
    expect(screenFor(BOTH, "signed-in", true)).toBe("app");
  });
});

describe("what runs in the app", () => {
  it("runs only connected services, and Spotify only once signed in", () => {
    expect(activeFor(SPOTIFY, true)).toEqual({ spotify: true, youtube: false, home: "/" });
    expect(activeFor(YOUTUBE, false)).toEqual({ spotify: false, youtube: true, home: "/youtube" });
    expect(activeFor(BOTH, true)).toEqual({ spotify: true, youtube: true, home: "/" });
    // Spotify on but not signed in yet: none of its pages, playlists or player.
    expect(activeFor(BOTH, false)).toEqual({ spotify: false, youtube: true, home: "/youtube" });
  });

  it("sends pages of a service that isn't running home", () => {
    const youtubeOnly = activeFor(YOUTUBE, false);
    expect(redirectFor("/", youtubeOnly)).toBe("/youtube");
    expect(redirectFor("/search", youtubeOnly)).toBe("/youtube/search");
    expect(redirectFor("/library", youtubeOnly)).toBe("/youtube/library");
    expect(redirectFor("/album/4aawyAB9vmqN3uQ7FjRGTy", youtubeOnly)).toBe("/youtube");
    expect(redirectFor("/liked", youtubeOnly)).toBe("/youtube");
    for (const stays of ["/youtube", "/youtube/search", "/settings", "/sound", "/local", "/now-playing"]) expect(redirectFor(stays, youtubeOnly)).toBeNull();

    const spotifyOnly = activeFor(SPOTIFY, true);
    expect(redirectFor("/youtube/album/MPREb_x", spotifyOnly)).toBe("/");
    expect(redirectFor("/", spotifyOnly)).toBeNull();
    expect(redirectFor("/youtube-ish", spotifyOnly)).toBeNull();
  });
});

describe("starting services", () => {
  beforeEach(() => {
    h.session.boot.mockClear();
    h.youtube.boot.mockClear();
    h.token = null;
    h.player.spotifyEnabled = true;
  });

  it("with YouTube Music only, never boots Spotify or its player", async () => {
    h.settings = { services: YOUTUBE };
    await services.boot();
    expect(h.session.boot).toHaveBeenCalledWith(false);
    expect(h.player.spotifyEnabled).toBe(false);
    expect(h.youtube.boot).toHaveBeenCalled();
  });

  it("doesn't ask someone who already used Spotify in Carbon", async () => {
    h.settings = { services: null };
    h.token = "saved-refresh-token";
    await services.boot();
    expect(services.value).toEqual(SPOTIFY);
    expect(h.session.boot).toHaveBeenCalledWith(true);
    expect(h.youtube.boot).not.toHaveBeenCalled();
  });

  it("asks a new listener, then starts what they chose", async () => {
    h.settings = { services: null };
    await services.boot();
    expect(services.value).toBeNull();
    expect(h.session.boot).not.toHaveBeenCalled();
    expect(await services.choose({ spotify: false, youtube: false })).toBe(false);
    expect(await services.choose(BOTH)).toBe(true);
    expect(services.setupNow).toBe(true);
    expect(h.session.boot).toHaveBeenCalledWith(true);
    expect(h.youtube.boot).toHaveBeenCalled();
  });

  it("turning a service off signs out of it and never leaves none on", async () => {
    h.settings = { services: BOTH };
    await services.boot();
    expect(await services.set("youtube", false)).toBe(true);
    expect(h.youtube.signOut).toHaveBeenCalled();
    expect(await services.set("spotify", false)).toBe(false);
    expect(services.value).toEqual(SPOTIFY);
  });
});
