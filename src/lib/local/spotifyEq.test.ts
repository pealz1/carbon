import { describe, expect, it } from "vitest";
import type { SoundSettings } from "./api";
import { BOOST_DB, eqMessage, frameState, SDK_ORIGIN } from "./spotifyEq";

describe("Spotify EQ bridge", () => {
  it("only trusts status messages from Spotify's SDK frame", () => {
    expect(frameState(SDK_ORIGIN, { carbonEq: { state: "protected" } })).toBe("protected");
    expect(frameState("https://evil.example", { carbonEq: { state: "active" } })).toBeNull();
    expect(frameState(SDK_ORIGIN, { carbonEq: { state: "explode" } })).toBeNull();
    expect(frameState(SDK_ORIGIN, "active")).toBeNull();
    expect(frameState(SDK_ORIGIN, null)).toBeNull();
  });

  it("also trusts YouTube's player, and nothing that only looks like it", () => {
    expect(frameState("https://www.youtube.com", { carbonEq: { state: "active" } })).toBe("active");
    expect(frameState("https://www.youtube.com.evil.example", { carbonEq: { state: "active" } })).toBeNull();
  });

  it("leaves the players alone unless the listener opted in", () => {
    const settings = { spotifyEq: false, boost: false, preampDb: -2, bands: Array(10).fill(1) } as SoundSettings;
    expect(eqMessage(settings)).toEqual({ carbonEq: { enabled: false, preampDb: 0, bands: Array(10).fill(0) } });
    expect(eqMessage({ ...settings, spotifyEq: true })).toEqual({ carbonEq: { enabled: true, preampDb: -2, bands: Array(10).fill(1) } });
  });

  it("routes for Boost alone with a flat curve, and adds it to the preamp with the EQ", () => {
    const settings = { spotifyEq: false, boost: true, preampDb: -2, bands: Array(10).fill(1) } as SoundSettings;
    expect(eqMessage(settings)).toEqual({ carbonEq: { enabled: true, preampDb: BOOST_DB, bands: Array(10).fill(0) } });
    expect(eqMessage({ ...settings, spotifyEq: true }).carbonEq.preampDb).toBe(-2 + BOOST_DB);
  });
});
