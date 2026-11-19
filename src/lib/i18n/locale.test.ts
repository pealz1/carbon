import { expect, it } from "vitest";
import { labels } from "./preprocess.js";
const catalogs = import.meta.glob<Record<string, string>>("./catalogs/*.json", { eager: true, import: "default" });
it("keeps the same authored labels in all ten translated catalogs", () => {
  const dictionaries = Object.values(catalogs);
  expect(dictionaries).toHaveLength(10);
  const keys = Object.keys(dictionaries[0]).sort();
  expect(keys.length).toBeGreaterThan(800);
  for (const dict of dictionaries) {
    expect(Object.keys(dict).sort()).toEqual(keys);
    expect(Object.values(dict).every((v) => typeof v === "string" && !!v.trim())).toBe(true);
  }
});
it("keeps track metadata, executable attributes and code samples outside translation", () => {
  const { edits } = labels(
    '<button aria-label="Play" class="primary">{track.name}</button><p>{playing ? "Pause":"Play"}</p><code>Example</code>',
  );
  expect(edits.map((e) => e.key)).toEqual(["Play", "Pause", "Play"]);
});
