// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

const invoke = vi.fn(async (..._args: unknown[]) => null);
const listen = vi.fn(async (_event: string, handler: (e: { payload: unknown }) => void) => {
  handler({ payload: { kind: "next" } });
  return () => {};
});
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: (event: string, handler: (e: { payload: unknown }) => void) => listen(event, handler) }));

const native = await import("./native");

describe("native bridge", () => {
  it("calls each Rust command by name with its arguments", async () => {
    const library = { folders: [], tags: {}, pins: [] };
    await native.getSettings();
    await native.libraryGet();
    await native.librarySet(library);
    await native.reportPlayback(null);
    await native.appInfo();
    await native.uninstall();
    await native.removeSavedData();
    await native.lastfmStatus();
    await native.lastfmConnect();
    await native.lastfmDisconnect();
    expect(invoke.mock.calls.map((c) => c[0])).toEqual([
      "settings_get",
      "library_get",
      "library_set",
      "playback_update",
      "app_info",
      "uninstall",
      "remove_saved_data",
      "lastfm_status",
      "lastfm_connect",
      "lastfm_disconnect",
    ]);
    expect(invoke.mock.calls[2][1]).toEqual({ library });
  });

  it("passes media key events through", async () => {
    const handler = vi.fn();
    await native.onMediaCommand(handler);
    expect(listen.mock.calls[0][0]).toBe("media-command");
    expect(handler).toHaveBeenCalledWith({ kind: "next" });
  });

  it("recognises Spotify Client IDs", () => {
    expect(native.isClientId("0123456789abcdef0123456789abcdef")).toBe(true);
    expect(native.isClientId("nope")).toBe(false);
  });
});

describe("preferences", () => {
  const settings = {
    closeToTray: true,
    discordPresence: true,
    lastfmScrobbling: true,
    effects: "full",
    accent: "mint",
    lyricsScale: 1.2,
    lyricsBlur: false,
    cinemaLayout: "lyrics",
    spotifyClientId: "",
    fontText: "",
    fontDisplay: "",
    fontLyrics: "Georgia",
    uiSounds: true,
    uiSoundVolume: 0.5,
  };

  it("loads Rust's settings onto the document and saves changes", async () => {
    const { prefs } = await import("./preferences.svelte");
    invoke.mockImplementation(async (...args: unknown[]) => (args[0] === "settings_set" ? (args[1] as { settings: unknown }).settings : settings) as null);
    await prefs.load();
    expect(document.documentElement.dataset.accent).toBe("mint");
    expect(document.documentElement.style.getPropertyValue("--lyrics-scale")).toBe("1.2");
    expect(document.documentElement.dataset.lyricsBlur).toBe("off");
    expect(document.documentElement.style.getPropertyValue("--font-lyrics")).toBe('"Georgia", var(--font-display-default)');
    expect(await prefs.update({ effects: "minimal" })).toBe(true);
    expect(document.documentElement.dataset.effects).toBe("minimal");
    expect(await prefs.update({ fontText: "Bahnschrift", fontLyrics: "" })).toBe(true);
    expect(document.documentElement.style.getPropertyValue("--font-text")).toBe('"Bahnschrift", var(--font-text-default)');
    expect(document.documentElement.style.getPropertyValue("--font-lyrics")).toBe("");
    vi.spyOn(console, "error").mockImplementation(() => {});
    invoke.mockRejectedValueOnce(new Error("lyrics size must be between 75% and 150%"));
    expect(await prefs.update({ lyricsScale: 9 })).toBe(false);
    expect(prefs.error).toMatch(/lyrics size/);
  });
});
