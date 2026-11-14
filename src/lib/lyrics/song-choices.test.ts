import { describe, expect, it } from "vitest";
import { MAX_ENTRIES, songChoices } from "./song-choices";

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
};

const choices = songChoices("test.choices", (value): value is "a" | "b" => value === "a" || value === "b");

describe("per-song choices", () => {
  it("remembers and forgets a song's choice", () => {
    const store = memory();
    expect(choices.get("song", store)).toBeUndefined();
    choices.set("song", "a", store);
    choices.set("other", "b", store);
    expect([choices.get("song", store), choices.get("other", store)]).toEqual(["a", "b"]);
    choices.set("song", undefined, store);
    expect(choices.get("song", store)).toBeUndefined();
    expect(store.data.get("test.choices")).toBe('{"other":"b"}');
  });

  it("drops the oldest songs past the cap, keeping one chosen again", () => {
    const store = memory();
    for (let i = 0; i <= MAX_ENTRIES; i++) choices.set(`song${i}`, "a", store);
    expect(choices.get("song0", store)).toBeUndefined();
    choices.set("song1", "b", store); // chosen again: now the newest
    choices.set("one-more", "a", store);
    expect(choices.get("song1", store)).toBe("b");
    expect(choices.get("song2", store)).toBeUndefined();
    expect(Object.keys(JSON.parse(store.data.get("test.choices")!))).toHaveLength(MAX_ENTRIES);
  });

  it("ignores unreadable or tampered storage, and works without any", () => {
    const store = memory();
    store.data.set("test.choices", '{"song":"z","ok":"a","n":1}');
    expect([choices.get("song", store), choices.get("ok", store)]).toEqual([undefined, "a"]);
    store.data.set("test.choices", "not json");
    expect(choices.get("ok", store)).toBeUndefined();
    store.data.set("test.choices", "[1]");
    expect(choices.get("0", store)).toBeUndefined();
    expect(choices.get("song", null)).toBeUndefined();
    expect(() => choices.set("song", "a", null)).not.toThrow();
  });
});
