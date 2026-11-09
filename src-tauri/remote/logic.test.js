import { describe, expect, it } from "vitest";
import { artistLine, describeConnectError, deviceLabel, formatTime, isCode, nextRepeat, positionAt, tokenFromHash } from "./logic.js";

describe("phone remote logic", () => {
  it("reads the pairing secret from the QR fragment", () => {
    expect(tokenFromHash("#token=0123456789abcdef0123456789abcdef")).toBe("0123456789abcdef0123456789abcdef");
    expect(tokenFromHash("#token=042137")).toBe("042137");
    expect(tokenFromHash("#token=<script>")).toBeNull();
    expect(tokenFromHash("")).toBeNull();
    expect(tokenFromHash(undefined)).toBeNull();
  });

  it("recognises six-digit codes", () => {
    expect(isCode(" 042137 ")).toBe(true);
    expect(isCode("42137")).toBe(false);
    expect(isCode("04213a")).toBe(false);
  });

  it("formats times", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(61_500)).toBe("1:01");
    expect(formatTime(-5)).toBe("0:00");
    expect(formatTime(Number.NaN)).toBe("0:00");
  });

  it("extrapolates position only while playing", () => {
    const state = { positionMs: 1000, durationMs: 5000, paused: false };
    expect(positionAt(state, 100, 600)).toBe(1500);
    expect(positionAt(state, 100, 99_999)).toBe(5000);
    expect(positionAt({ ...state, paused: true }, 100, 600)).toBe(1000);
    expect(positionAt(null, 0, 0)).toBe(0);
  });

  it("cycles repeat modes", () => {
    expect(nextRepeat("off")).toBe("context");
    expect(nextRepeat("context")).toBe("track");
    expect(nextRepeat("track")).toBe("off");
  });

  it("labels devices and artists", () => {
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("iPhone");
    expect(deviceLabel("Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile Safari")).toBe("Android phone");
    expect(deviceLabel(undefined)).toBe("Browser");
    expect(artistLine(["A", "B"])).toBe("A, B");
    expect(artistLine(null)).toBe("");
  });

  it("explains connection errors", () => {
    expect(describeConnectError("unauthorized")).toMatchObject({ fatal: true, forget: true });
    expect(describeConnectError("rate_limited")).toMatchObject({ fatal: true, forget: false });
    expect(describeConnectError("websocket error")).toMatchObject({ fatal: false });
  });
});
