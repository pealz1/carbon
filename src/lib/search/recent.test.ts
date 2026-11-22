import { describe, expect, it } from "vitest";
import { MAX_RECENT, parseRecent, remembered } from "./recent";

describe("recent searches", () => {
  it("puts the newest first and never lists one twice", () => {
    expect(remembered(["b", "a"], " c ")).toEqual(["c", "b", "a"]);
    expect(remembered(["b", "Daft Punk", "a"], "daft punk")).toEqual(["daft punk", "b", "a"]);
    expect(remembered(["a"], "   ")).toEqual(["a"]);
  });

  it("keeps eight", () => {
    const list = Array.from({ length: 12 }, (_, i) => `term ${i}`).reduce<string[]>(remembered, []);
    expect(list).toHaveLength(MAX_RECENT);
    expect(list[0]).toBe("term 11");
  });

  it("reads whatever storage holds as a clean list", () => {
    expect(parseRecent('["a","b"]')).toEqual(["a", "b"]);
    expect(parseRecent(null)).toEqual([]);
    expect(parseRecent("not json")).toEqual([]);
    expect(parseRecent('{"a":1}')).toEqual([]);
    expect(parseRecent(JSON.stringify(["ok", 3, "", null, "x".repeat(500)]))).toEqual(["ok"]);
    expect(parseRecent(JSON.stringify(Array.from({ length: 30 }, (_, i) => `t${i}`)))).toHaveLength(MAX_RECENT);
  });
});
