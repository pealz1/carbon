import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MenuItem } from "./menu.svelte";
import type { BlocklistData } from "./native";
import type { Track } from "./spotify/types";

vi.mock("$lib/native", () => ({
  blocklistGet: vi.fn(async (): Promise<BlocklistData> => ({ items: [], skipExplicit: false })),
  blocklistSet: vi.fn(async (data: BlocklistData) => structuredClone(data)),
}));
vi.mock("$lib/spotify/endpoints", () => ({ isExplicit: vi.fn(async () => false) }));
vi.mock("$lib/player.svelte", () => ({
  player: { track: null as Track | null, next: vi.fn(async () => {}), previous: vi.fn(async () => {}), seek: vi.fn(async () => {}), position: vi.fn(() => 0) },
}));

const native = await import("$lib/native");
const sp = await import("$lib/spotify/endpoints");
const { player } = await import("$lib/player.svelte");
const { toasts } = await import("./toast.svelte");
const { blocklist, blockItems } = await import("./blocklist.svelte");

const song = (id: string, artists: { name: string; uri: string }[] = [{ name: "Band", uri: "spotify:artist:band" }]): Track => ({
  id,
  uri: `spotify:track:${id}`,
  name: `Song ${id}`,
  artists: artists.map((a) => ({ id: "", ...a })),
  album: null,
  durationMs: 1000,
  explicit: false,
});

const lastToast = () => toasts.items.at(-1);
const playing = (track: Track | null) => (player.track = track);
const label = (item: MenuItem) => item.label;

beforeEach(async () => {
  vi.clearAllMocks();
  toasts.items = [];
  playing(null);
  await blocklist.load();
  blocklist.data = { items: [], skipExplicit: false };
});

describe("auto-skip", () => {
  it("skips a blocked artist's song and Undo brings it back for this session", async () => {
    const track = song("t1");
    await blocklist.block({ kind: "artist", uri: "spotify:artist:band", name: "Band", by: "" });
    playing(track);
    await blocklist.check(track);
    expect(player.next).toHaveBeenCalledTimes(1);
    expect(lastToast()?.text).toBe("Skipped “Song t1”: Band is blocked.");

    vi.mocked(player.position).mockReturnValueOnce(4_000);
    toasts.act(lastToast()!);
    await vi.waitFor(() => expect(player.previous).toHaveBeenCalled());
    expect(player.seek).toHaveBeenCalledWith(0); // past the restart point, so it rewinds first
    await blocklist.check(track);
    expect(player.next).toHaveBeenCalledTimes(1);
  });

  it("leaves songs alone that nothing blocks, and local files always", async () => {
    await blocklist.block({ kind: "song", uri: "spotify:track:other", name: "Other", by: "" });
    playing(song("t2"));
    await blocklist.check(song("t2"));
    const local = { ...song("x"), uri: "local:abc" };
    playing(local);
    await blocklist.block({ kind: "artist", uri: "spotify:artist:band", name: "Band", by: "" });
    await blocklist.check(local);
    expect(player.next).not.toHaveBeenCalled();
  });

  it("looks up whether a Spotify song is explicit, only when skipping explicit songs", async () => {
    const track = song("t3");
    playing(track);
    await blocklist.check(track);
    expect(sp.isExplicit).not.toHaveBeenCalled();
    await blocklist.setSkipExplicit(true);
    vi.mocked(sp.isExplicit).mockResolvedValueOnce(true);
    await blocklist.check(track);
    expect(sp.isExplicit).toHaveBeenCalledWith("t3");
    expect(lastToast()?.text).toMatch(/: explicit\.$/);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(sp.isExplicit).mockRejectedValueOnce(new Error("offline"));
    await blocklist.check(song("t4"));
    expect(player.next).toHaveBeenCalledTimes(1);
  });

  it("doesn't skip when the song changed while Carbon looked", async () => {
    await blocklist.block({ kind: "song", uri: "spotify:track:t5", name: "Song t5", by: "" });
    playing(song("t6"));
    await blocklist.check(song("t5"));
    expect(player.next).not.toHaveBeenCalled();
  });

  it("stops skipping after ten blocked songs in a row", async () => {
    await blocklist.block({ kind: "artist", uri: "spotify:artist:band", name: "Band", by: "" });
    for (let i = 0; i < 11; i++) {
      playing(song(`r${i}`));
      await blocklist.check(song(`r${i}`));
    }
    expect(player.next).toHaveBeenCalledTimes(10);
    expect(lastToast()?.text).toMatch(/stopped skipping/);
  });
});

describe("blocking", () => {
  it("skips the playing song when it gets blocked, and Undo unblocks it", async () => {
    const track = song("t7");
    playing(track);
    const [blockSong] = blockItems(track);
    expect(label(blockSong)).toBe("Block song");
    await blockSong.action!();
    expect(player.next).toHaveBeenCalledTimes(1);
    expect(label(blockSong)).toBe("Unblock song");
    expect(lastToast()?.text).toBe("Blocked Song t7.");
    toasts.act(lastToast()!);
    await vi.waitFor(() => expect(blocklist.data.items).toEqual([]));
  });

  it("offers each artist of a song with several", () => {
    const [, artists] = blockItems(song("t8", [{ name: "A", uri: "spotify:artist:a" }, { name: "B", uri: "" }]));
    expect(artists.items?.map((i) => (i as MenuItem).label)).toEqual(["A", "B"]);
    expect(blockItems(song("t9", [])).map(label)).toEqual(["Block song"]);
  });

  it("says so when saving fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(native.blocklistSet).mockRejectedValueOnce("the disk is full");
    await blocklist.block({ kind: "song", uri: "spotify:track:t10", name: "Song t10", by: "" });
    expect(blocklist.data.items).toEqual([]);
    expect(lastToast()).toMatchObject({ kind: "error" });
  });
});
