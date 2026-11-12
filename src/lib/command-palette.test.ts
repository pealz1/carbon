import { describe, expect, it } from "vitest";
import { fuzzyScore, MAX_RECENT, parseRecent, rank, remember, type RecentEntry } from "./command-palette";

describe("fuzzy matching", () => {
  it("needs every letter, in order", () => {
    expect(fuzzyScore("lks", "Liked Songs")).not.toBeNull();
    expect(fuzzyScore("skl", "Liked Songs")).toBeNull();
    expect(fuzzyScore("", "anything")).toBe(0);
  });

  it("ignores case, accents and spaces in the query", () => {
    expect(fuzzyScore("beyonce", "Beyoncé")).not.toBeNull();
    expect(fuzzyScore("liked songs", "LikedSongs")).not.toBeNull();
  });

  it("prefers prefixes, then the query inside a name, then scattered letters", () => {
    const prefix = fuzzyScore("set", "Settings")!;
    const inside = fuzzyScore("set", "Sunset trip")!;
    const scattered = fuzzyScore("set", "Super deluxe tape")!;
    expect(prefix).toBeGreaterThan(inside);
    expect(inside).toBeGreaterThan(scattered);
  });

  it("ranks matches best first and keeps ties in order", () => {
    const items = ["Queue", "Toggle queue", "Lyrics", "Quiet evening"];
    expect(rank(items, "queue", (s) => s)).toEqual(["Queue", "Toggle queue"]);
    expect(rank(["b", "a", "c"], "", (s) => s)).toEqual(["b", "a", "c"]);
    expect(rank(items, "q", (s) => s, 1)).toEqual(["Queue"]);
  });
});

describe("recent picks", () => {
  const entry = (id: string): RecentEntry => ({ id, label: id, detail: "", image: null, href: `/${id}` });

  it("moves a repeat pick to the front and caps the list", () => {
    let list: RecentEntry[] = [];
    for (let i = 0; i < MAX_RECENT + 3; i++) list = remember(list, entry(`p${i}`));
    expect(list).toHaveLength(MAX_RECENT);
    list = remember(list, entry("p5"));
    expect(list[0].id).toBe("p5");
    expect(list.filter((e) => e.id === "p5")).toHaveLength(1);
  });

  it("reads back only well-formed entries", () => {
    const good = entry("settings");
    const play: RecentEntry = { id: "t", label: "Song", detail: "Artist", image: "https://i.scdn.co/x", playUri: "spotify:track:1" };
    const raw = JSON.stringify([good, play, { id: 3 }, { ...good, id: "ext", href: "https://example.com" }, null]);
    expect(parseRecent(raw)).toEqual([good, play]);
    expect(parseRecent("{}")).toEqual([]);
    expect(parseRecent("broken")).toEqual([]);
    expect(parseRecent(null)).toEqual([]);
  });
});
