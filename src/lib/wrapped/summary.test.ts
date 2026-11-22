import { expect, it } from "vitest";
import type { Entry } from "$lib/history/entries";
import { wrappedFor } from "$lib/history/wrapped";
import { summaryText } from "./summary";

const MIN = 60_000;
const play = (day: number, id: string, over: Partial<Entry> = {}): Entry => ({
  at: new Date(2026, 4, day, 14).getTime(),
  source: "spotify",
  uri: `spotify:track:${id}`,
  title: `Song ${id}`,
  artists: [`Band ${id}`],
  album: `Album ${id}`,
  image: null,
  durationMs: 3 * MIN,
  ...over,
});
const same = (label: string) => label;

it("puts the year in a few plain lines", () => {
  const plays = [...Array.from({ length: 8 }, (_, i) => play(1 + (i % 3), "a")), ...Array.from({ length: 4 }, () => play(3, "b"))];
  expect(summaryText(wrappedFor(plays, 2026)!, same).split("\n")).toEqual([
    "Your year in Carbon · 2026",
    "Minutes listened: 36",
    "Plays: 12",
    "Top song: Song a · Band a",
    "Top artist: Band a",
    "Top album: Album a · Band a",
    "Longest streak: 3 days",
    "Listening style: Loyalist",
  ]);
});

it("leaves out what the year doesn't have, and translates only the labels", () => {
  const plays = Array.from({ length: 10 }, () => play(9, "a", { artists: [], album: "" }));
  const shout = (label: string) => label.toUpperCase();
  expect(summaryText(wrappedFor(plays, 2026)!, shout).split("\n")).toEqual([
    "YOUR YEAR IN CARBON · 2026",
    "MINUTES LISTENED: 30",
    "PLAYS: 10",
    "TOP SONG: Song a",
    "LONGEST STREAK: 1 DAY",
    "LISTENING STYLE: LOYALIST",
  ]);
});
