import { describe, expect, it } from "vitest";
import type { Settings } from "./native";
import { diagnostics } from "./diagnostics";

describe("diagnostics", () => {
  it("lists versions and switches without naming the listener", () => {
    const settings = {
      effects: "full",
      gameMode: true,
      motion: "normal",
      uiScale: 1.1,
      privateSession: false,
      closeToTray: true,
      remoteEnabled: false,
      lyricsSources: ["lrclib"],
      displayName: "Secret Name",
      spotifyClientId: "0123456789abcdef0123456789abcdef",
    } as Settings;
    const text = diagnostics({
      info: { version: "0.7.2" } as never,
      settings,
      services: { spotify: true, youtube: false },
      player: { source: "spotify", status: "ready", playing: true, hasTrack: true },
      userAgent: "UA",
      platform: "Win32",
    });
    expect(text).toContain("Carbon 0.7.2");
    expect(text).toContain("game mode on");
    expect(text).toContain("Services: Spotify");
    expect(text).not.toContain("Secret Name");
    expect(text).not.toContain("0123456789abcdef");
  });
});
