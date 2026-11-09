import { describe, expect, it } from "vitest";
import { cropSquare, fileProblem, fitJpeg, stripDataUrl } from "./cover";
import { isValid, PLAYLIST_LIMITS, playlistProblems, toFields } from "./playlist-form";

const draft = { name: "Road trip", description: "", public: true, collaborative: false };

describe("playlist form", () => {
  it("accepts a normal playlist", () => {
    expect(playlistProblems(draft)).toEqual({});
    expect(isValid(draft)).toBe(true);
  });

  it("explains every problem in plain words", () => {
    expect(playlistProblems({ ...draft, name: "   " }).name).toMatch(/name/);
    expect(playlistProblems({ ...draft, name: "x".repeat(PLAYLIST_LIMITS.name + 1) }).name).toMatch(/up to 100/);
    expect(playlistProblems({ ...draft, name: "a\u0001b" }).name).toMatch(/characters/);
    expect(playlistProblems({ ...draft, description: "x".repeat(PLAYLIST_LIMITS.description + 1) }).description).toMatch(/up to 300/);
    expect(playlistProblems({ ...draft, description: "two\nlines" }).description).toMatch(/one line/);
    expect(isValid({ ...draft, name: "" })).toBe(false);
  });

  it("counts characters, not UTF-16 units", () => {
    expect(playlistProblems({ ...draft, name: "🎧".repeat(PLAYLIST_LIMITS.name) })).toEqual({});
  });

  it("trims and keeps collaborative playlists private", () => {
    expect(toFields({ name: "  Mix ", description: " hi ", public: true, collaborative: true })).toEqual({
      name: "Mix",
      description: "hi",
      public: false,
      collaborative: true,
    });
  });
});

describe("cover", () => {
  it("strips the data URL prefix", () => {
    expect(stripDataUrl("data:image/jpeg;base64,QUJD")).toBe("QUJD");
    expect(stripDataUrl("QUJD")).toBe("QUJD");
  });

  it("crops the centred square", () => {
    expect(cropSquare(1000, 600)).toEqual({ sx: 200, sy: 0, side: 600 });
    expect(cropSquare(300, 500)).toEqual({ sx: 0, sy: 100, side: 300 });
  });

  it("rejects files that aren't usable images", () => {
    expect(fileProblem({ type: "image/png", size: 1000 })).toBeNull();
    expect(fileProblem({ type: "application/pdf", size: 10 })).toMatch(/JPEG/);
    expect(fileProblem({ type: "image/jpeg", size: 30 * 1024 * 1024 })).toMatch(/20 MB/);
  });

  it("steps quality down until the base64 fits", async () => {
    const tried: number[] = [];
    const encode = (q: number) => {
      tried.push(q);
      return `data:image/jpeg;base64,${"A".repeat(Math.round(q * 1000))}`;
    };
    const base64 = await fitJpeg(encode, 700);
    expect(base64.length).toBeLessThanOrEqual(700);
    expect(tried[0]).toBeGreaterThan(tried.at(-1)!);
  });

  it("gives up with a plain message when nothing fits", async () => {
    await expect(fitJpeg(() => "data:image/jpeg;base64,AAAA", 2)).rejects.toThrow(/256 KB/);
  });
});
