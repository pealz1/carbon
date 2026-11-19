import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/player.svelte", () => ({ player: {} }));
vi.mock("$lib/preferences.svelte", () => ({ prefs: {} }));
const { stepVolume } = await import("./volume-wheel");

describe("stepVolume", () => {
  it("moves by the step, up for scrolling up", () => {
    expect(stepVolume(0.5, -100, 0.05)).toBe(0.55);
    expect(stepVolume(0.5, 100, 0.01)).toBe(0.49);
  });

  it("stays between silent and full", () => {
    expect(stepVolume(0.98, -1, 0.05)).toBe(1);
    expect(stepVolume(0.02, 1, 0.25)).toBe(0);
  });
});
