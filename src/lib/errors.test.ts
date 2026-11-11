import { describe, expect, it } from "vitest";
import { describeError, describeNotice, EngineError, explain, isDeviceGone, SdkError, type SdkEvent } from "./errors";
import { ApiError, NetworkError } from "./spotify/api";

describe("describeError", () => {
  it("explains common Spotify statuses", () => {
    expect(describeError(new ApiError(401, "x"))).toMatch(/expired/);
    expect(describeError(new ApiError(403, "x"))).toMatch(/doesn't let/);
    expect(describeError(new ApiError(403, "Insufficient client scope"))).toMatch(/Sign in again/);
    expect(describeError(new ApiError(404, "x"))).toMatch(/couldn't find/);
    expect(describeError(new ApiError(429, "x"))).toMatch(/rate-limiting/);
    expect(describeError(new ApiError(503, "x"))).toMatch(/trouble/);
  });

  it("passes through other API messages, Rust's sentences and network failures", () => {
    expect(describeError(new ApiError(400, "Invalid limit"))).toBe("Invalid limit");
    expect(describeError(new TypeError("Failed to fetch"))).toMatch(/connection/);
    expect(describeError(new Error("boom"))).toBe("boom");
    expect(describeError("the remote port must be between 1024 and 65535")).toBe("the remote port must be between 1024 and 65535");
    expect(describeError({ weird: true })).toBe("Something went wrong.");
    expect(describeError("  ")).toBe("Something went wrong.");
  });

  it("says what Carbon did only when it did it", () => {
    expect(describeError(new ApiError(503, "x", null, 2))).toBe("Spotify is having trouble right now. Carbon tried 3 times. Try again shortly.");
    expect(describeError(new ApiError(502, "x"))).toBe("Spotify is having trouble right now. Try again shortly.");
    expect(describeError(new NetworkError(2, new TypeError("Failed to fetch")))).toBe("Can't reach Spotify. Carbon tried 3 times. Check your connection.");
  });
});

describe("explain", () => {
  it("maps Spotify API failures to an automatic fix", () => {
    expect(explain(new ApiError(401, "The access token expired")).fix).toBe("sign-in");
    expect(explain(new ApiError(403, "Insufficient client scope")).fix).toBe("reconsent");
    expect(explain(new ApiError(404, "Device not found")).fix).toBe("reconnect");
    expect(explain(new ApiError(429, "Too many requests", null, 2))).toMatchObject({ fix: "wait", doing: expect.stringMatching(/waited/) });
    expect(explain(new ApiError(500, "Server error")).fix).toBe("retry");
    expect(explain(new NetworkError(0, null)).fix).toBe("retry");
  });

  it("explains that playback needs Premium, by reason or message", () => {
    const premium = /needs Spotify Premium/;
    expect(explain(new ApiError(403, "Player command failed: Restriction violated", "PREMIUM_REQUIRED")).what).toMatch(premium);
    expect(explain(new ApiError(403, "Premium required")).what).toMatch(premium);
    expect(explain(new SdkError("account_error", "This functionality is restricted to premium users only")).what).toMatch(premium);
  });

  it("explains accounts that aren't allowed on the Client ID", () => {
    expect(describeError(new ApiError(403, "User not registered in the Developer Dashboard"))).toMatch(/isn't allowed on that Client ID/);
  });

  it("covers every SDK event with an explanation and a next step", () => {
    const events: SdkEvent[] = ["initialization_error", "authentication_error", "account_error", "playback_error", "autoplay_failed", "connect_failed", "not_ready"];
    for (const event of events) {
      const p = explain(new SdkError(event, "detail"));
      expect(p.what, event).toBeTruthy();
      expect(p.persists, event).toBeTruthy();
    }
    expect(explain(new SdkError("autoplay_failed")).fix).toBe("start-playback");
    expect(explain(new SdkError("initialization_error", "Failed to initialize player")).fix).toBe("restart");
    expect(explain(new SdkError("authentication_error", "Invalid token scopes.")).fix).toBe("sign-in");
  });

  it("keeps the engine's own sentence and adds what to try", () => {
    const skipped = explain(new EngineError("Couldn't play “a.flac”: unsupported codec. Skipping it."));
    expect(skipped.what).toMatch(/Skipping it/);
    expect(skipped.persists).toMatch(/another player/);
    expect(explain(new EngineError("The audio device stopped working. Switching to the current default.")).persists).toMatch(/Sound page/);
    expect(explain(new EngineError("Carbon's audio engine stopped. Restart Carbon to play local files.")).fix).toBe("restart");
  });
});

describe("isDeviceGone", () => {
  it("matches only a forgotten or never-ready device", () => {
    expect(isDeviceGone(new ApiError(404, "Device not found"))).toBe(true);
    expect(isDeviceGone(new SdkError("not_ready"))).toBe(true);
    expect(isDeviceGone(new SdkError("connect_failed"))).toBe(true);
    // Not active yet is expected before the first play (shufflePlay relies on it); no reconnect.
    expect(isDeviceGone(new ApiError(404, "Player command failed: No active device found", "NO_ACTIVE_DEVICE"))).toBe(false);
    expect(isDeviceGone(new ApiError(404, "Non existing id"))).toBe(false);
    expect(isDeviceGone(new SdkError("autoplay_failed"))).toBe(false);
  });
});

describe("describeNotice", () => {
  it("says what Carbon is doing while it waits", () => {
    expect(describeNotice({ kind: "retrying", cause: "rate-limit", waitMs: 3000 })).toBe("Spotify asked Carbon to slow down. Trying again in 3 s.");
    expect(describeNotice({ kind: "retrying", cause: "server", waitMs: 500 })).toBe("Spotify had a problem. Trying again in 1 s.");
    expect(describeNotice({ kind: "retrying", cause: "network", waitMs: 1000 })).toMatch(/Couldn't reach Spotify/);
    expect(describeNotice({ kind: "auth-lost" })).toMatch(/couldn't renew/);
    expect(describeNotice({ kind: "scope-missing" })).toMatch(/permissions/);
  });
});
