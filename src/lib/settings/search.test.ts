import { describe, expect, it } from "vitest";
import { fold, matchSettings, type SearchRow } from "./search";

const ROWS: SearchRow[] = [
  { label: "Theme", group: "Theme", keywords: "dark mode light oled" },
  { label: "Thème sombre", group: "Apparence" },
  { label: "Open at startup", group: "Startup", keywords: "boot login autostart" },
  { label: "Startup page", group: "Startup" },
  { label: "EQ, loudness, crossfade and output", group: "Audio", keywords: "equalizer bass" },
  { label: "Language", group: "Text", keywords: "locale" },
];
const labels = (query: string) => matchSettings(ROWS, query).map((row) => row.label);

describe("fold", () => {
  it("drops case and accents", () => {
    expect(fold("Thème ÉQ Español")).toBe("theme eq espanol");
  });
});

describe("matchSettings", () => {
  it("finds nothing for an empty or blank query", () => {
    expect(labels("")).toEqual([]);
    expect(labels("   ")).toEqual([]);
  });

  it("matches the label whatever the case", () => {
    expect(labels("LANGUAGE")).toEqual(["Language"]);
  });

  it("ignores accents in the query and in the row", () => {
    expect(labels("theme")).toEqual(["Theme", "Thème sombre"]);
    expect(labels("thème")).toEqual(["Theme", "Thème sombre"]);
  });

  it("matches the group heading", () => {
    expect(labels("startup")).toEqual(["Open at startup", "Startup page"]);
    expect(labels("audio")).toEqual(["EQ, loudness, crossfade and output"]);
  });

  it("matches keywords", () => {
    expect(labels("oled")).toEqual(["Theme"]);
    expect(labels("equalizer")).toEqual(["EQ, loudness, crossfade and output"]);
    expect(labels("boot")).toEqual(["Open at startup"]);
  });

  it("needs every word, in any field and any order", () => {
    expect(labels("mode dark")).toEqual(["Theme"]);
    expect(labels("page startup")).toEqual(["Startup page"]);
    expect(labels("dark lyrics")).toEqual([]);
  });

  it("matches part of a word", () => {
    expect(labels("lang")).toEqual(["Language"]);
  });

  it("keeps the rows in the order given", () => {
    expect(labels("t").slice(0, 3)).toEqual(["Theme", "Thème sombre", "Open at startup"]);
  });

  it("returns the rows themselves", () => {
    expect(matchSettings(ROWS, "locale")[0]).toBe(ROWS[5]);
  });
});
