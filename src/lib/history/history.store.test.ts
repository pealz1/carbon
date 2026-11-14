import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "$lib/spotify/types";
import type { Entry } from "./entries";

const saved: Entry[] = [];
let pausedOnDisk = false;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, args?: { entry?: Entry; paused?: boolean }) => {
    if (command === "history_add") return !pausedOnDisk && (saved.push(args!.entry!), true);
    if (command === "history_get") return [...saved];
    if (command === "history_pause") return (pausedOnDisk = args!.paused!);
    if (command === "history_clear") return void (saved.length = 0);
    return pausedOnDisk; // history_paused
  }),
}));
vi.mock("$lib/player.svelte", () => ({ player: { track: null as Track | null, paused: true, durationMs: 0, source: "spotify" } }));

const { player } = (await import("$lib/player.svelte")) as unknown as { player: { track: Track | null; paused: boolean; durationMs: number; source: string } };
const { history } = await import("./history.svelte");

const MIN = 60_000;
const song = (id: string, durationMs = 4 * MIN, uri = `spotify:track:${id}`): Track => ({
  id,
  uri,
  name: `Song ${id}`,
  artists: [{ id: "", name: "Band", uri: "" }],
  album: { id: "", name: "Album", uri: "", image: "https://i.scdn.co/cover" },
  durationMs,
  explicit: false,
});

/** Puts a song on (or takes it off) and tells the store, as its effect on the player does in the app. */
function playing(track: Track | null, paused = false) {
  player.track = track;
  player.durationMs = track?.durationMs ?? 0;
  player.paused = paused;
  history.look();
}

async function wait(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
}

function setPaused(paused: boolean) {
  player.paused = paused;
  history.look();
}

beforeEach(async () => {
  vi.useFakeTimers({ now: new Date(2026, 2, 10, 12) });
  saved.length = 0;
  pausedOnDisk = false;
  await history.setPaused(false);
  playing(null, true);
});

afterEach(() => vi.useRealTimers());

describe("recording plays", () => {
  it("saves a song once it has played for half its length", async () => {
    playing(song("a"));
    await wait(2 * MIN - 1_000);
    expect(saved).toEqual([]);
    await wait(1_000);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toEqual({ at: Date.now(), source: "spotify", uri: "spotify:track:a", title: "Song a", artists: ["Band"], album: "Album", image: "https://i.scdn.co/cover", durationMs: 4 * MIN });
    await wait(2 * MIN);
    expect(saved).toHaveLength(1);
  });

  it("waits four minutes at most for a long song", async () => {
    playing(song("long", 30 * MIN));
    await wait(4 * MIN);
    expect(saved).toHaveLength(1);
  });

  it("doesn't count time spent paused", async () => {
    playing(song("a"));
    await wait(MIN);
    setPaused(true);
    await wait(30 * MIN);
    expect(saved).toEqual([]);
    setPaused(false);
    await wait(MIN - 1_000);
    expect(saved).toEqual([]);
    await wait(1_000);
    expect(saved).toHaveLength(1);
  });

  it("skips a song that was skipped early, and counts the next from zero", async () => {
    playing(song("a"));
    await wait(MIN);
    playing(song("b"));
    await wait(MIN + 30_000);
    expect(saved).toEqual([]);
    await wait(30_000);
    expect(saved.map((e) => e.uri)).toEqual(["spotify:track:b"]);
  });

  it("counts a repeat of the same song again", async () => {
    playing(song("a"));
    await wait(4 * MIN); // the first time through
    expect(saved).toHaveLength(1);
    await wait(2 * MIN); // halfway through the repeat
    expect(saved.map((e) => e.uri)).toEqual(["spotify:track:a", "spotify:track:a"]);
  });

  it("never records a station, an episode or a song of 30 seconds or less", async () => {
    playing(song("station", 0, "radio:station:abc"));
    await wait(20 * MIN);
    playing(song("episode", 40 * MIN, "spotify:episode:abc"));
    await wait(20 * MIN);
    playing(song("jingle", 30_000));
    await wait(20 * MIN);
    expect(saved).toEqual([]);
  });

  it("records where the song came from, and a length that arrives late", async () => {
    player.source = "youtube";
    playing(song("v", 0, "ytm:video:v"));
    await wait(MIN);
    player.durationMs = 4 * MIN;
    history.look();
    await wait(MIN);
    expect(saved).toMatchObject([{ source: "youtube", uri: "ytm:video:v", durationMs: 4 * MIN }]);
    player.source = "spotify";
  });
});

describe("pausing history", () => {
  it("records nothing while paused, and picks up with the next song", async () => {
    await history.setPaused(true);
    expect(history.paused).toBe(true);
    playing(song("a"));
    await wait(4 * MIN);
    expect(saved).toEqual([]);
    await history.setPaused(false);
    await wait(MIN); // the song already passed its mark while paused: it stays out
    expect(saved).toEqual([]);
    playing(song("b"));
    await wait(2 * MIN);
    expect(saved.map((e) => e.uri)).toEqual(["spotify:track:b"]);
  });
});

describe("the list a page shows", () => {
  it("loads once, then grows as plays are saved, and empties when cleared", async () => {
    playing(song("a"));
    await wait(2 * MIN);
    await history.load();
    expect(history.loaded).toBe(true);
    expect(history.entries.map((e) => e.uri)).toEqual(["spotify:track:a"]);
    playing(song("b"));
    await wait(2 * MIN);
    expect(history.entries.map((e) => e.uri)).toEqual(["spotify:track:a", "spotify:track:b"]);
    expect(await history.clear()).toBe(true);
    expect(history.entries).toEqual([]);
    expect(saved).toEqual([]);
  });
});
