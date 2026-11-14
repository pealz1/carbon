import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Found } from "$lib/lyrics";
import type { Track } from "$lib/spotify/types";
import { linesToTranslate, translationFor } from "./translate";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const track = (id: string) => ({ id }) as Track;
const synced = (...texts: string[]): Found => ({ source: "lrclib", lyrics: { kind: "synced", lines: texts.map((text, i) => ({ timeMs: i * 1000, text })) } });

beforeEach(() => invoke.mockReset());

describe("linesToTranslate", () => {
  it("sends each line with words once, in order", () => {
    expect(linesToTranslate(synced("la pluie", "", "tombe", "la pluie").lyrics)).toEqual(["la pluie", "tombe"]);
    expect(linesToTranslate({ kind: "plain", text: " la pluie \n\ntombe\n" })).toEqual(["la pluie", "tombe"]);
    expect(linesToTranslate({ kind: "instrumental" })).toEqual([]);
  });
});

describe("translationFor", () => {
  it("pairs each line with its translation, leaving out lines that came back unchanged", async () => {
    invoke.mockResolvedValue(["the rain", "Oh oh", "falls"]);
    const lines = await translationFor(track("a"), synced("la pluie", "oh oh", "tombe"), "en");
    expect(invoke).toHaveBeenCalledWith("lyrics_translate", { lines: ["la pluie", "oh oh", "tombe"], target: "en" });
    expect([...lines]).toEqual([
      ["la pluie", "the rain"],
      ["tombe", "falls"],
    ]);
  });

  it("uses NetEase's own translation for Chinese, and the translator for anything else", async () => {
    const own = new Map([["first", "第一行"]]);
    const found: Found = { ...synced("first"), source: "netease", translation: { language: "zh", lines: own } };
    expect(await translationFor(track("b"), found, "zh-CN")).toBe(own);
    expect(invoke).not.toHaveBeenCalled();
    invoke.mockResolvedValue(["premier"]);
    expect([...(await translationFor(track("b"), found, "fr"))]).toEqual([["first", "premier"]]);
  });

  it("asks once per song, source and language, and again after a failure", async () => {
    invoke.mockResolvedValue(["the rain"]);
    await translationFor(track("c"), synced("la pluie"), "en");
    await translationFor(track("c"), synced("la pluie"), "en");
    expect(invoke).toHaveBeenCalledTimes(1);
    await translationFor(track("c"), synced("la pluie"), "de");
    await translationFor(track("c"), { ...synced("la pluie"), source: "netease" }, "en");
    expect(invoke).toHaveBeenCalledTimes(3);
    invoke.mockRejectedValueOnce("Couldn't get an answer from the translator. Try again shortly.");
    await expect(translationFor(track("d"), synced("la pluie"), "en")).rejects.toMatch(/translator/);
    expect([...(await translationFor(track("d"), synced("la pluie"), "en"))]).toEqual([["la pluie", "the rain"]]);
  });

  it("has nothing to ask for a song without words", async () => {
    expect((await translationFor(track("e"), { source: null, lyrics: { kind: "none" } }, "en")).size).toBe(0);
    expect(invoke).not.toHaveBeenCalled();
  });
});
