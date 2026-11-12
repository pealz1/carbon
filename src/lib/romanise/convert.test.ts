// @vitest-environment node
// Runs the real libraries and kuromoji dictionary on self-written sample phrases (not lyrics).
import { beforeAll, describe, expect, it } from "vitest";
import { aidFor, converter, furiganaParts, tidy, useDictionary } from "./convert";
import { prepare } from "./index";

beforeAll(() => useDictionary("node_modules/@sglkc/kuromoji/dict/"));

describe("tidy", () => {
  it("evens out spacing around words and punctuation", () => {
    expect(tidy(" ikō , ABC   123 ! ")).toBe("ikō, ABC 123!");
    expect(tidy("「 a 」")).toBe("「a」");
  });
});

describe("furiganaParts", () => {
  it("puts readings over kanji and leaves kana around them plain", () => {
    const tokens = [
      { surface_form: "今日", reading: "キョウ" },
      { surface_form: "は", reading: "ハ" },
      { surface_form: "降っ", reading: "フッ" },
      { surface_form: "て", reading: "テ" },
      { surface_form: "ABC", reading: "*" },
      { surface_form: "お茶", reading: "オチャ" },
    ];
    expect(furiganaParts(tokens)).toEqual([
      { text: "今日", reading: "きょう" },
      { text: "は" },
      { text: "降", reading: "ふ" },
      { text: "ってABCお" },
      { text: "茶", reading: "ちゃ" },
    ]);
  });
});

describe("aidFor", () => {
  it("writes Japanese in rōmaji, with furigana when asked", async () => {
    expect(await aidFor("今日は雨", "ja", false)).toEqual({ roman: "kyō wa ame" });
    const { ruby } = await aidFor("今日は雨", "ja", true);
    expect(ruby).toEqual([{ text: "今日", reading: "きょう" }, { text: "は" }, { text: "雨", reading: "あめ" }]);
  });

  it("writes Chinese in pinyin, reading traditional characters as simplified", async () => {
    expect((await aidFor("我们去公园", "zh", false)).roman).toBe("wǒ men qù gōng yuán");
    expect((await aidFor("我們去公園", "zh", false)).roman).toBe("wǒ men qù gōng yuán");
  });

  it("writes Korean in Revised Romanisation with sound changes", async () => {
    expect((await aidFor("국물", "ko", false)).roman).toBe("gungmul");
  });
});

describe("Chinese characters", () => {
  it("converts between simplified and traditional", async () => {
    expect((await converter("traditional"))("我们去公园")).toBe("我們去公園");
    expect((await converter("simplified"))("我們去公園")).toBe("我们去公园");
  });
});

describe("prepare", () => {
  it("converts Chinese lines, keeps word timing and romanises the shown text", async () => {
    const lyrics = {
      kind: "synced" as const,
      lines: [
        { timeMs: 0, text: "我们去公园", words: [{ text: "我们", startMs: 0, endMs: 500 }, { text: "去公园", startMs: 500, endMs: 1000 }] },
        { timeMs: 2000, text: "plain words" },
      ],
    };
    const { lyrics: shown, aids } = await prepare(lyrics, { romanise: true, furigana: false, chinese: "traditional" });
    if (shown.kind !== "synced") throw new Error("expected synced lyrics");
    expect(shown.lines[0].text).toBe("我們去公園");
    expect(shown.lines[0].words?.map((w) => [w.text, w.startMs])).toEqual([["我們", 0], ["去公園", 500]]);
    expect(shown.lines[1]).toBe(lyrics.lines[1]);
    expect(aids.get("我們去公園")?.roman).toBe("wǒ men qù gōng yuán");
    expect(aids.has("plain words")).toBe(false);
  });

  it("splits plain lyrics into lines and leaves them alone when nothing is asked", async () => {
    const lyrics = { kind: "plain" as const, text: "오늘\nhello" };
    const off = await prepare(lyrics, { romanise: false, furigana: false, chinese: "simplified" });
    expect(off.lyrics).toBe(lyrics);
    expect(off.aids.size).toBe(0);
    const on = await prepare(lyrics, { romanise: true, furigana: false, chinese: "original" });
    expect(on.aids.get("오늘")?.roman).toBe("oneul");
  });
});
