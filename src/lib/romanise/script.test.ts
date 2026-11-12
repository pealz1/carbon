import { describe, expect, it } from "vitest";
import { detectScripts, mainScript } from "./script";

// Self-written sample phrases, not lyrics.
describe("detectScripts", () => {
  it("tells Japanese, Korean and other lines apart", () => {
    expect(detectScripts(["きょうはいい天気", "カタカナ", "오늘은 맑음", "plain words", "", "123 !"])).toEqual(["ja", "ja", "ko", null, null, null]);
  });

  it("reads Han-only lines as Japanese when the song has kana", () => {
    expect(detectScripts(["朝の散歩", "公園", "plain words"])).toEqual(["ja", "ja", null]);
  });

  it("reads Han-only lines as Chinese otherwise, simplified or traditional", () => {
    expect(detectScripts(["我们去公园", "我們去公園", "walk"])).toEqual(["zh", "zh", null]);
  });

  it("keeps Hangul lines Korean whatever else is in the song", () => {
    expect(detectScripts(["한국어 OK", "ひらがな"])).toEqual(["ko", "ja"]);
  });
});

describe("mainScript", () => {
  it("names the most common script, or none", () => {
    expect(mainScript(["ja", "ko", "ja", null])).toBe("ja");
    expect(mainScript([null, null])).toBeNull();
    expect(mainScript([])).toBeNull();
  });
});
