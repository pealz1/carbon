import { describe, expect, it } from "vitest";
import { EMBED_ORIGIN, embedUrl, explainEmbedError, NO_PLAYER, parseMessage } from "./embed";

const msg = (event: string, info: unknown) => JSON.stringify({ event, info, id: 1, channel: "widget" });

describe("embed messages", () => {
  it("reads player events from YouTube's origin only", () => {
    expect(parseMessage(EMBED_ORIGIN, msg("onReady", null))).toEqual({ ready: true });
    expect(parseMessage(EMBED_ORIGIN, msg("onError", 150))).toEqual({ error: 150 });
    expect(parseMessage(EMBED_ORIGIN, msg("onStateChange", 0))).toEqual({ state: "ended" });
    expect(parseMessage(EMBED_ORIGIN, msg("infoDelivery", { playerState: 1, currentTime: 12.5, duration: 229 }))).toEqual({
      state: "playing",
      timeS: 12.5,
      durationS: 229,
    });
    expect(parseMessage("https://evil.example", msg("onReady", null))).toBeNull();
    expect(parseMessage(EMBED_ORIGIN, "not json")).toBeNull();
    expect(parseMessage(EMBED_ORIGIN, { event: "onReady" })).toBeNull();
    expect(parseMessage(EMBED_ORIGIN, msg("onStateChange", 42))).toBeNull();
    expect(parseMessage(EMBED_ORIGIN, msg("infoDelivery", { volume: 50 }))).toBeNull();
  });

  it("builds the embed address with the API on and the page's origin", () => {
    const url = new URL(embedUrl("7374CZQoS2Y", "http://tauri.localhost", 61.8));
    expect(url.origin + url.pathname).toBe("https://www.youtube.com/embed/7374CZQoS2Y");
    expect(url.searchParams.get("enablejsapi")).toBe("1");
    expect(url.searchParams.get("origin")).toBe("http://tauri.localhost");
    expect(url.searchParams.get("start")).toBe("61");
    expect(new URL(embedUrl("x", "http://localhost:1420")).searchParams.has("start")).toBe(false);
  });
});

describe("why a song won't play", () => {
  it("prefers YouTube's own reason", () => {
    expect(explainEmbedError(150, { status: "LOGIN_REQUIRED", reason: "Sign in to confirm your age", playableInEmbed: true })).toMatch(/age-restricted/);
    expect(explainEmbedError(150, { status: "UNPLAYABLE", reason: "The uploader has not made this video available in your country", playableInEmbed: true })).toMatch(
      /region/,
    );
    expect(explainEmbedError(150, { status: "ERROR", reason: "Video unavailable", playableInEmbed: null })).toMatch(/removed/);
    expect(explainEmbedError(150, { status: "OK", reason: null, playableInEmbed: false })).toMatch(/outside YouTube/);
  });

  it("falls back to the embed's error code", () => {
    expect(explainEmbedError(101)).toMatch(/outside YouTube/);
    expect(explainEmbedError(100)).toMatch(/removed/);
    expect(explainEmbedError(153)).toMatch(/refused Carbon's player/);
    expect(explainEmbedError(NO_PLAYER)).toMatch(/connection/);
    expect(explainEmbedError(999)).toMatch(/error 999/);
  });
});
