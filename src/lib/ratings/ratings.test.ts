import { describe, expect, it } from "vitest";
import { byStars, clampStars, starsForClick, starsForKey, starsText, type Rating } from "./ratings";

const rating = (uri: string, stars: number, at = 1): Rating => ({ uri, stars, at, title: uri, artists: [], album: "", image: null, durationMs: 0 });

describe("stars", () => {
  it("stay whole and between 0 and 5", () => {
    expect([-1, 0, 2.4, 2.5, 5, 9, Number.NaN].map(clampStars)).toEqual([0, 0, 2, 3, 5, 5, 0]);
  });

  it("step with the arrows and stop at the ends", () => {
    expect(starsForKey("ArrowRight", 2)).toBe(3);
    expect(starsForKey("ArrowUp", 5)).toBe(5);
    expect(starsForKey("ArrowLeft", 1)).toBe(0);
    expect(starsForKey("ArrowDown", 0)).toBe(0);
  });

  it("are set by a digit, cleared by Delete, and jump with Home and End", () => {
    expect(["0", "3", "5"].map((key) => starsForKey(key, 2))).toEqual([0, 3, 5]);
    expect(["Delete", "Backspace", "Home"].map((key) => starsForKey(key, 4))).toEqual([0, 0, 0]);
    expect(starsForKey("End", 1)).toBe(5);
  });

  it("leave every other key to the app", () => {
    expect(["6", "9", " ", "Enter", "Tab", "a", "Escape"].map((key) => starsForKey(key, 2))).toEqual([null, null, null, null, null, null, null]);
  });

  it("clear when the star a song already has is clicked again", () => {
    expect(starsForClick(4, 2)).toBe(4);
    expect(starsForClick(4, 4)).toBe(0);
    expect(starsForClick(1, 0)).toBe(1);
  });

  it("read aloud as a count", () => {
    expect(starsText(0)).toBe("Not rated");
    expect(starsText(3)).toBe("3 of 5 stars");
  });
});

describe("rated songs", () => {
  it("are grouped by stars, five first, most recently rated first", () => {
    const groups = byStars([rating("a", 3, 1), rating("b", 5, 1), rating("c", 3, 9), rating("d", 1, 1), rating("e", 5, 4)]);
    expect(groups.map((g) => [g.stars, g.ratings.map((r) => r.uri)])).toEqual([
      [5, ["e", "b"]],
      [3, ["c", "a"]],
      [1, ["d"]],
    ]);
  });

  it("leave out empty groups and unrated songs", () => {
    expect(byStars([])).toEqual([]);
    expect(byStars([rating("a", 0)])).toEqual([]);
  });
});
