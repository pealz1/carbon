import { coverOf } from "./cloud";
import { it, expect } from "vitest";
import { direction } from "./sync.svelte";
it("requires review when both devices changed and preserves local deletions", () => {
  expect(direction(3, 2, 9, 8)).toBe("review");
  expect(direction(2, 2, 9, 8)).toBe("download");
  expect(direction(3, 2, 8, 8)).toBe("upload");
  expect(direction(2, 2, 8, 8)).toBe("current");
  expect(direction(null, 2, 8, 8)).toBe("removed");
  expect(direction(null, 0, 8, 0)).toBe("download");
  expect(direction(2, 0, 8, 0)).toBe("review");
});

it("restores provider artwork from catalog identifiers", () => {
  expect(coverOf({ uri: "ytm:video:abcdefghijk" })).toBe("https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg");
  expect(coverOf({ uri: "spotify:track:a", artwork: "a".repeat(40) })).toMatch(/^https:\/\/i.scdn.co\/image\//);
  expect(coverOf({ uri: "spotify:track:a", artwork: "https://untrusted.test" })).toBeNull();
});
