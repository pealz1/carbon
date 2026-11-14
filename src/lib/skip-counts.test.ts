import { describe, expect, it } from "vitest";
import { countSkip, forgetSkips, isSkip, skipsOf } from "./skip-counts";

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

describe("skip counts", () => {
  it("count each skip of a song and forget it on request", () => {
    const store = memory();
    expect(countSkip("spotify:track:a", store)).toBe(1);
    expect(countSkip("spotify:track:a", store)).toBe(2);
    expect(skipsOf("spotify:track:a", store)).toBe(2);
    expect(skipsOf("spotify:track:b", store)).toBe(0);
    forgetSkips("spotify:track:a", store);
    expect(skipsOf("spotify:track:a", store)).toBe(0);
  });

  it("ignore storage that was edited or is unreadable", () => {
    expect(skipsOf("a", memory({ "carbon.skipCounts": '{"a":"many","b":-2,"c":3}' }))).toBe(0);
    expect(skipsOf("c", memory({ "carbon.skipCounts": '{"a":"many","b":-2,"c":3}' }))).toBe(3);
    expect(skipsOf("a", memory({ "carbon.skipCounts": "not json" }))).toBe(0);
    expect(countSkip("a", null)).toBe(0);
  });

  it("treat Next late in a song as moving on, not a skip", () => {
    expect(isSkip(10_000, 200_000)).toBe(true);
    expect(isSkip(150_000, 200_000)).toBe(false);
    expect(isSkip(5_000, 0)).toBe(true); // no length known
  });
});
