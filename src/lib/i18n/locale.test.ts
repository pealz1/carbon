import { expect, it } from "vitest";
import { labels } from "./preprocess.js";
const catalogs = import.meta.glob<Record<string, string>>("./catalogs/*.json", { eager: true, import: "default" });
const sources = import.meta.glob<string>(["/src/lib/**/*.svelte", "/src/routes/**/*.svelte"], { eager: true, query: "?raw", import: "default" });
const sourceLabels = () => Object.entries(sources).flatMap(([file, code]) => labels(code).edits.map((e) => ({ file, key: e.key })));

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
it("leaves brand names alone whatever their case", () => {
  expect(labels('<span class="sr-only">carbon</span><p>Spotify</p>').edits).toEqual([]);
});
it("has a translation for every label in the interface", () => {
  const keys = new Set(Object.keys(Object.values(catalogs)[0]));
  expect(sourceLabels().filter((l) => !keys.has(l.key))).toEqual([]);
});
it("never sends an icon name through translation", () => {
  const icon = Object.entries(sources).find(([file]) => file.endsWith("/components/Icon.svelte"))![1];
  const names = new Set([...icon.match(/const PATHS = \{([\s\S]*?)\} as const/)![1].matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]));
  expect(names.size).toBeGreaterThan(20);
  // Real words that happen to share an icon's name: "{n} more", "Scroll {title} back".
  const words = new Set(["back", "close", "forward", "more"]);
  expect(sourceLabels().filter((l) => names.has(l.key) && !words.has(l.key))).toEqual([]);
});

const BRANDS = ["Spotify", "YouTube Music", "SoundCloud", "Apple Music", "Bandcamp", "Last.fm", "ListenBrainz", "Discord", "Carbon"];
// Fragments are glued to the text around them, so their outer spaces and joining punctuation must survive.
const edges = (s: string) => [/^\s/.test(s), /\s$/.test(s), s.match(/^[.,:;…”]*/)![0], s.match(/[,:;…“]*$/)![0]].join("|");
const urls = (s: string) => (s.match(/\b(?:https?:\/\/|[a-z0-9-]+\.(?:com|cc)\b)[^\s,]*/gi) ?? []).map((u) => u.replace(/[.)]+$/, ""));
it("keeps brand names, links and joining punctuation in every translation", () => {
  const kept = (key: string, value: string) => [...BRANDS.filter((b) => key.includes(b)), ...urls(key)].every((x) => value.includes(x));
  const broken = Object.entries(catalogs).flatMap(([file, dict]) =>
    Object.entries(dict)
      .filter(([key, value]) => edges(key) !== edges(value) || !kept(key, value))
      .map(([key, value]) => `${file}: ${key} → ${value}`),
  );
  expect(broken).toEqual([]);
});
