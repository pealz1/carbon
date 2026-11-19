import { describe, expect, it } from "vitest";
import { canInstallQuietly, shouldCheck, type Moment } from "./update-policy";

const quiet: Moment = { state: "ready", auto: true, shown: false, playing: false };

describe("update policy", () => {
  it("checks again only when nothing is found, under way or waiting", () => {
    expect(shouldCheck("idle")).toBe(true);
    expect(shouldCheck("current")).toBe(true);
    expect(shouldCheck("error")).toBe(true);
    expect(shouldCheck("checking")).toBe(false);
    expect(shouldCheck("available")).toBe(false);
    expect(shouldCheck("downloading")).toBe(false);
    expect(shouldCheck("ready")).toBe(false);
  });

  it("installs by itself only from the tray with nothing playing", () => {
    expect(canInstallQuietly(quiet)).toBe(true);
    expect(canInstallQuietly({ ...quiet, shown: true })).toBe(false);
    expect(canInstallQuietly({ ...quiet, playing: true })).toBe(false);
    expect(canInstallQuietly({ ...quiet, auto: false })).toBe(false);
    expect(canInstallQuietly({ ...quiet, state: "downloading" })).toBe(false);
  });
});
