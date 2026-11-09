import { describe, expect, it } from "vitest";
import type { SoundSettings } from "./api";
import { eqMessage, frameState, SDK_ORIGIN } from "./spotifyEq";

describe("Spotify EQ bridge", () => {
  it("only trusts status messages from Spotify's SDK frame", () => {
    expect(frameState(SDK_ORIGIN, { carbonEq: { state: "protected" } })).toBe("protected");
    expect(frameState("https://evil.example", { carbonEq: { state: "active" } })).toBeNull();
    expect(frameState(SDK_ORIGIN, { carbonEq: { state: "explode" } })).toBeNull();
    expect(frameState(SDK_ORIGIN, "active")).toBeNull();
    expect(frameState(SDK_ORIGIN, null)).toBeNull();
  });

  it("sends the EQ disabled unless the listener opted in", () => {
    const settings = { spotifyEq: false, preampDb: -2, bands: Array(10).fill(1) } as SoundSettings;
    expect(eqMessage(settings)).toEqual({ carbonEq: { enabled: false, preampDb: -2, bands: Array(10).fill(1) } });
    expect(eqMessage({ ...settings, spotifyEq: true }).carbonEq.enabled).toBe(true);
  });
});
