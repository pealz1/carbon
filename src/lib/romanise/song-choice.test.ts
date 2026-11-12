import { describe, expect, it } from "vitest";
import { romanChoice, saveRomanChoice } from "./song-choice";

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
};

describe("per-song romanisation", () => {
  it("has no choice until one is made", () => {
    expect(romanChoice("song", memory())).toBeUndefined();
    expect(romanChoice("song", null)).toBeUndefined();
  });

  it("remembers a song's own choice either way", () => {
    const store = memory();
    expect(saveRomanChoice("a", true, false, store)).toBe(true);
    expect(saveRomanChoice("b", false, true, store)).toBe(false);
    expect(romanChoice("a", store)).toBe(true);
    expect(romanChoice("b", store)).toBe(false);
  });

  it("forgets a choice that matches the default", () => {
    const store = memory();
    saveRomanChoice("a", true, false, store);
    expect(saveRomanChoice("a", false, false, store)).toBeUndefined();
    expect(store.data.get("carbon.lyricsRomanised")).toBe("{}");
  });

  it("ignores unreadable or tampered storage", () => {
    const store = memory();
    store.setItem("carbon.lyricsRomanised", "not json");
    expect(romanChoice("a", store)).toBeUndefined();
    store.setItem("carbon.lyricsRomanised", JSON.stringify({ a: "yes" }));
    expect(romanChoice("a", store)).toBeUndefined();
  });
});
