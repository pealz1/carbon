import { describe, expect, it } from "vitest";
import type { TagEdit } from "./api";
import { joinArtists, problemsOf, splitArtists, TAG_LIMITS, toEdit, toForm } from "./tag-edit";

const edit: TagEdit = {
  title: "Blue in Green",
  artists: ["Miles Davis", "Tyler, the Creator"],
  album: "Kind of Blue",
  albumArtist: "Miles Davis",
  trackNo: 3,
  discNo: null,
  year: 1959,
  genre: "Jazz",
};

describe("tag editor form", () => {
  it("round-trips a file's tags through the form", () => {
    const form = toForm(edit);
    expect(form.artists).toBe("Miles Davis; Tyler, the Creator");
    expect(form.discNo).toBe("");
    expect(problemsOf(form)).toEqual({});
    expect(toEdit(form)).toEqual(edit);
  });

  it("splits artists on semicolons only, dropping blanks", () => {
    expect(splitArtists(" A ;; B, C ;")).toEqual(["A", "B, C"]);
    expect(splitArtists("  ")).toEqual([]);
    expect(joinArtists([])).toBe("");
  });

  it("trims text and treats empty numbers as unset", () => {
    const form = { ...toForm(edit), title: "  Song ", trackNo: " ", year: " 2001 " };
    expect(problemsOf(form)).toEqual({});
    expect(toEdit(form)).toMatchObject({ title: "Song", trackNo: null, year: 2001 });
  });

  it("names the field that is out of range", () => {
    const form = toForm(edit);
    expect(Object.keys(problemsOf({ ...form, trackNo: "0" }))).toEqual(["trackNo"]);
    expect(Object.keys(problemsOf({ ...form, trackNo: String(TAG_LIMITS.trackNo + 1) }))).toEqual(["trackNo"]);
    expect(Object.keys(problemsOf({ ...form, discNo: "1.5" }))).toEqual(["discNo"]);
    expect(Object.keys(problemsOf({ ...form, year: "-3" }))).toEqual(["year"]);
    expect(Object.keys(problemsOf({ ...form, year: "MCMLIX" }))).toEqual(["year"]);
    expect(problemsOf({ ...form, discNo: String(TAG_LIMITS.discNo) })).toEqual({});
  });

  it("limits text by characters and refuses control characters", () => {
    const form = toForm(edit);
    expect(problemsOf({ ...form, title: "é".repeat(TAG_LIMITS.text) })).toEqual({});
    expect(Object.keys(problemsOf({ ...form, title: "x".repeat(TAG_LIMITS.text + 1) }))).toEqual(["title"]);
    expect(Object.keys(problemsOf({ ...form, album: "two\nlines" }))).toEqual(["album"]);
    expect(Object.keys(problemsOf({ ...form, artists: Array(TAG_LIMITS.artists + 1).fill("a").join(";") }))).toEqual(["artists"]);
    expect(Object.keys(problemsOf({ ...form, artists: `ok; ${"x".repeat(TAG_LIMITS.text + 1)}` }))).toEqual(["artists"]);
  });
});
