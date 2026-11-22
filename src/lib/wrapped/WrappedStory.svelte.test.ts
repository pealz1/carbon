// @vitest-environment jsdom
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Entry } from "$lib/history/entries";
import { wrappedFor } from "$lib/history/wrapped";

// Every slide of a year, mounted and walked through, with the player and the clipboard stood in
// for. Motion is off here, so count-ups show their final figure at once.
// (Why "svelte" is mocked: see Story.svelte.test.ts.)
// @ts-expect-error The client build has no declaration file at this path.
vi.mock("svelte", () => import("../../../node_modules/svelte/src/index-client.js"));

const player = { playTracks: vi.fn(async (_uris: string[], _index?: number, _tracks?: { uri: string }[]) => undefined), error: null as string | null };
const copyText = vi.fn(async (_text: string) => true);
vi.doMock("$lib/player.svelte", () => ({ player }));
vi.doMock("$lib/clipboard", () => ({ copyText }));
vi.doMock("$lib/on-screen.svelte", () => ({ onScreen: { current: true } }));
vi.doMock("$lib/preferences.svelte", () => ({ prefs: { effects: "minimal", motion: "none" } }));
vi.doMock("$lib/art-tones.svelte", () => ({ artTones: () => ({ current: null }) }));
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
  this.setAttribute("open", "");
};

const { default: WrappedStory } = await import("./WrappedStory.svelte");

const MIN = 60_000;
const play = (day: number, id: string, over: Partial<Entry> = {}): Entry => ({
  at: new Date(2026, 2, day, 21, 30).getTime(),
  source: "spotify",
  uri: `spotify:track:${id}`,
  title: `Song ${id}`,
  artists: [`Band ${id}`],
  album: `Album ${id}`,
  image: `https://i.scdn.co/${id}`,
  durationMs: 3 * MIN,
  ...over,
});
const times = (count: number, day: number, id: string, over: Partial<Entry> = {}) => Array.from({ length: count }, () => play(day, id, over));

let story: ReturnType<typeof mount> | undefined;
const show = (entries: Entry[], years = [2026], handlers = { onpick: vi.fn(), onclose: vi.fn() }) => {
  story = mount(WrappedStory, { target: document.body, props: { year: wrappedFor(entries, 2026)!, years, ...handlers } });
  flushSync();
  return handlers;
};
const slideText = () => document.querySelector(".story-slide")!.textContent!.replace(/\s+/g, " ").trim();
const heading = () => document.querySelector(".story-slide :is(h1, h2)")!.textContent!.trim();
const on = () => (document.querySelector<HTMLElement>(".zone.on")!.click(), flushSync());
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>(".story-slide button")].find((b) => b.textContent!.trim() === label)!;

afterEach(() => {
  if (story) void unmount(story);
  story = undefined;
  vi.clearAllMocks();
});

describe("WrappedStory", () => {
  const mixed = [...times(6, 2, "a"), ...times(4, 3, "y", { source: "youtube", uri: "ytm:video:y" }), ...times(3, 4, "b"), play(5, "c")];

  it("tells the year in ten slides, in order", () => {
    show(mixed);
    expect(document.querySelectorAll(".segment")).toHaveLength(10);
    const headings = [heading()];
    for (let i = 1; i < 10; i++) headings.push((on(), heading()));
    expect(headings).toEqual([
      "Your year in Carbon",
      "You listened for",
      "The song you played most",
      "Top songs",
      "The artist you played most",
      "Top albums",
      "When you listen",
      "Milestones",
      "Your listening style",
      "That was your year",
    ]);
  });

  it("shows the year's own numbers on its slides", () => {
    show(mixed);
    expect(slideText()).toContain("2026");
    expect(document.querySelector("[role='group']")).toBeNull(); // one year: nothing to pick
    on();
    expect(slideText()).toMatch(/You listened for 42 ?42 minutes/); // the figure and the count-up over it
    expect(slideText()).toContain("Spotify 71% of plays");
    on();
    expect(slideText()).toContain("Song a");
    expect(slideText()).toContain("Band a");
    on();
    expect([...document.querySelectorAll(".story-slide li .what")].map((el) => el.textContent)).toEqual(["Song a", "Song y", "Song b", "Song c"]);
    expect(slideText()).toContain("1 play");
    on();
    expect(document.querySelector(".story-slide .name")!.textContent).toBe("Band a");
    expect(document.querySelector(".story-slide ol")!.getAttribute("start")).toBe("2");
    on();
    expect(document.querySelectorAll(".story-slide .mosaic img")).toHaveLength(4);
    on();
    expect(document.querySelectorAll(".story-slide .bar")).toHaveLength(24 + 12);
    expect(document.querySelectorAll(".story-slide .bar.peak")).toHaveLength(2);
    on();
    expect(slideText()).toContain("Longest streak");
    expect(slideText()).toMatch(/4 ?4 days/);
    expect(slideText()).toContain("Song a");
    on();
    expect(slideText()).toContain("All-rounder");
  });

  it("offers the other years on the first slide", () => {
    const { onpick } = show(mixed, [2026, 2025, 2023]);
    const years = [...document.querySelectorAll<HTMLButtonElement>("[role='group'] button")];
    expect(years.map((b) => [b.textContent, b.getAttribute("aria-pressed")])).toEqual([["2026", "true"], ["2025", "false"], ["2023", "false"]]);
    years[1].click();
    expect(onpick).toHaveBeenCalledWith(2025);
  });

  it("queues the top songs of the most played song's service, and copies the summary", async () => {
    show(mixed);
    for (let i = 1; i < 10; i++) on();
    button("Play your top songs").click();
    await vi.waitFor(() => expect(player.playTracks).toHaveBeenCalledTimes(1));
    const [uris, index, tracks] = player.playTracks.mock.calls[0];
    expect(uris).toEqual(["spotify:track:a", "spotify:track:b", "spotify:track:c"]);
    expect(index).toBe(0);
    expect(tracks).toMatchObject([{ uri: "spotify:track:a", name: "Song a" }, { uri: "spotify:track:b" }, { uri: "spotify:track:c" }]);

    button("Copy summary").click();
    await vi.waitFor(() => expect(document.querySelector("[role='status']")!.textContent).toBe("Copied"));
    expect(copyText.mock.calls[0][0]).toContain("Top song: Song a · Band a");
  });

  it("says so on the slide when the player or the clipboard refuses", async () => {
    show(mixed);
    for (let i = 1; i < 10; i++) on();
    copyText.mockResolvedValueOnce(false);
    button("Copy summary").click();
    await vi.waitFor(() => expect(document.querySelector("[role='status']")!.textContent).toBe("Couldn't copy that."));
    vi.spyOn(console, "error").mockImplementation(() => {});
    player.playTracks.mockRejectedValueOnce(new Error("offline"));
    button("Play your top songs").click();
    await vi.waitFor(() => expect(document.querySelector("[role='status']")!.textContent).toBe("Couldn't play your top songs."));
  });

  it("goes without the artist and album slides when the year has neither", () => {
    show(times(10, 7, "a", { artists: [], album: "", image: null }));
    expect(document.querySelectorAll(".segment")).toHaveLength(8);
    const headings = [heading()];
    for (let i = 1; i < 8; i++) headings.push((on(), heading()));
    expect(headings).not.toContain("The artist you played most");
    expect(headings).not.toContain("Top albums");
    expect(headings.at(-1)).toBe("That was your year");
    expect(slideText()).not.toContain("Top artist");
  });
});
