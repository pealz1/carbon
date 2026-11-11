// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createSfx, soundFor } from "./sfx";
import { envelope, peakGain, RECIPES, soundAllowed, type SoundGate } from "./ui-sound";

const IDLE: SoundGate = { enabled: true, volume: 0.5, paused: true, trackUri: null };

describe("soundAllowed (policy III.7: never over Spotify audio)", () => {
  it("is silent while a Spotify track plays", () => {
    expect(soundAllowed({ ...IDLE, paused: false, trackUri: "spotify:track:abc" })).toBe(false);
  });

  it("plays while Spotify is paused, with nothing loaded, or over a local file", () => {
    expect(soundAllowed({ ...IDLE, paused: true, trackUri: "spotify:track:abc" })).toBe(true);
    expect(soundAllowed(IDLE)).toBe(true);
    expect(soundAllowed({ ...IDLE, paused: false, trackUri: "local:42" })).toBe(true);
  });

  it("plays over YouTube Music, which isn't Spotify audio, and stays silent for anything unknown", () => {
    expect(soundAllowed({ ...IDLE, paused: false, trackUri: "ytm:video:7374CZQoS2Y" })).toBe(true);
    expect(soundAllowed({ ...IDLE, paused: false, trackUri: "something:else" })).toBe(false);
  });

  it("respects the Settings switch and a zero volume", () => {
    expect(soundAllowed({ ...IDLE, enabled: false })).toBe(false);
    expect(soundAllowed({ ...IDLE, volume: 0 })).toBe(false);
  });
});

describe("levels", () => {
  it("peaks near −24 dBFS at the default volume and never above −18 dBFS", () => {
    expect(20 * Math.log10(peakGain(0.5))).toBeCloseTo(-24, 0);
    expect(20 * Math.log10(peakGain(1))).toBeCloseTo(-18, 5);
    expect(peakGain(4)).toBe(peakGain(1));
    expect(peakGain(-1)).toBe(0);
  });

  it("keeps every recipe at or under its peak, even where parts overlap", () => {
    for (const recipe of Object.values(RECIPES)) {
      const parts = [...recipe.tones, ...(recipe.noise ? [recipe.noise] : [])];
      for (let t = 0; t < 0.5; t += 0.0005) {
        expect(parts.reduce((sum, part) => sum + envelope(t, part), 0)).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("createSfx", () => {
  it("never even opens audio while gated", () => {
    const makeContext = vi.fn();
    const sfx = createSfx(() => ({ ...IDLE, paused: false, trackUri: "spotify:track:abc" }), makeContext);
    expect(sfx.play("tap")).toBe(false);
    expect(makeContext).not.toHaveBeenCalled();
  });

  it("survives audio that can't start", () => {
    const sfx = createSfx(
      () => IDLE,
      () => {
        throw new Error("no audio device");
      },
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(sfx.play("tap")).toBe(false);
  });
});

describe("soundFor", () => {
  const el = (html: string) => {
    document.body.innerHTML = html;
    return document.body.querySelector("[data-hit]") ?? document.body.firstElementChild;
  };

  it("taps buttons, whooshes links and selects choices", () => {
    expect(soundFor(el(`<button><span data-hit>Go</span></button>`))).toBe("tap");
    expect(soundFor(el(`<a href="/library">Library</a>`))).toBe("whoosh");
    expect(soundFor(el(`<button role="menuitem">Pin</button>`))).toBe("select");
    expect(soundFor(el(`<button aria-pressed="false">Lyrics</button>`))).toBe("select");
  });

  it("stays quiet for disabled controls, plain text and opted-out areas", () => {
    expect(soundFor(el(`<button disabled>No</button>`))).toBeNull();
    expect(soundFor(el(`<p>Just text</p>`))).toBeNull();
    expect(soundFor(el(`<div data-silent><button data-hit>Seek</button></div>`))).toBeNull();
  });
});
