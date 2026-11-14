import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyLibrary } from "$lib/organizer";
import type { Backup, BackupPlaylist } from "./backup-format";

vi.mock("$lib/spotify/endpoints", () => ({
  save: vi.fn(async () => {}),
  unsave: vi.fn(),
  deletePlaylist: vi.fn(),
  removeFromPlaylist: vi.fn(),
  createPlaylist: vi.fn(async ({ name }: { name: string }) => ({ id: `new-${name}` })),
  addToPlaylist: vi.fn(async () => {}),
  myPlaylists: vi.fn(async () => ({ items: [{ id: "p1", name: "Mine", description: "", ownerId: "me", ownerName: "Me", public: false, collaborative: false }], total: 1, nextOffset: null })),
  me: vi.fn(async () => ({ id: "me" })),
}));
vi.mock("$lib/spotify/api", () => ({ ApiError: class extends Error {}, getFresh: vi.fn(async () => ({ items: [], next: null, artists: { items: [], next: null } })) }));
vi.mock("$lib/session.svelte", () => ({ session: { profile: { id: "me" }, refreshPlaylists: vi.fn(async () => {}) } }));
vi.mock("$lib/native", () => ({ libraryGet: vi.fn(async () => ({ folders: [], tags: {}, pins: ["p1"] })) }));
vi.mock("$lib/organizer.svelte", () => ({ organizer: { data: { folders: [], tags: {}, pins: [] }, change: vi.fn(async () => true) } }));
vi.mock("$lib/local/playlists.svelte", () => ({ carbonPlaylists: { list: [], error: null, load: vi.fn(async () => {}) } }));
vi.mock("$lib/smart/store.svelte", () => ({ smart: { list: [], loaded: true, error: null, load: vi.fn(async () => {}) } }));
vi.mock("./files", () => ({ smartSet: vi.fn(async () => {}) }));
vi.mock("./tools.svelte", () => ({ createCarbonPlaylist: vi.fn(async (name: string) => `carbon-${name}`), playlistName: (name: string) => name }));
vi.mock("./rows", () => ({
  likedRows: vi.fn(async (tick?: (done: number, total: number | null) => void) => {
    tick?.(1, 1);
    return [{ uri: "spotify:track:t1", name: "Song", artists: ["Artist"] }];
  }),
  playlistRows: vi.fn(async () => [{ uri: "spotify:track:t1", name: "Song", artists: [] }, { uri: "", name: "Unavailable", artists: [] }]),
}));

const sp = await import("$lib/spotify/endpoints");
const { organizer } = await import("$lib/organizer.svelte");
const { smart } = await import("$lib/smart/store.svelte");
const { smartSet } = await import("./files");
const { planRestore, parseBackup } = await import("./backup-format");
const { Stopped } = await import("./copy");
const { collectBackup, readCurrent, runRestore } = await import("./backup");

const uris = (kind: string, n: number) => Array.from({ length: n }, (_, i) => ({ uri: `spotify:${kind}:${kind}${i}`, name: `${kind} ${i}`, artists: [] }));
const playlist = (id: string, over: Partial<BackupPlaylist> = {}): BackupPlaylist => ({
  id,
  name: id,
  description: "Two\nlines",
  public: true,
  collaborative: false,
  owned: true,
  owner: "Me",
  tracksRead: true,
  tracks: [...uris("track", 150), { uri: "spotify:local:a:b:c:1", name: "File", artists: [] }],
  ...over,
});
const smartRule = { id: "s1", name: "Smart", match: "all" as const, rules: [], sources: { liked: true, playlists: false, albums: false, local: false }, limit: 500, output: "spotify" as const, targetId: "old", refreshedMs: 0 };
const backup = (over: Partial<Backup> = {}): Backup => ({
  app: "Carbon",
  kind: "library-backup",
  version: 1,
  createdAt: "2026-11-13T10:00:00.000Z",
  liked: uris("track", 90),
  albums: uris("album", 2),
  artists: uris("artist", 1),
  playlists: [playlist("old"), playlist("theirs", { owned: false, tracks: [] })],
  carbonPlaylists: [{ id: "c1", name: "Mix", items: [], updatedMs: 1 }],
  smartPlaylists: [smartRule],
  organizer: { folders: [], tags: { old: ["chill"] }, pins: [] },
  ...over,
});
const nothing = { liked: [], albums: [], artists: [], playlists: [], carbon: [], smart: [] };
const run = (b: Backup, signal = new AbortController().signal) => runRestore(b, planRestore(b, nothing), vi.fn(), signal);

describe("backing up", () => {
  afterEach(() => vi.clearAllMocks());

  it("collects a file that reads back, leaving out rows without a link", async () => {
    const made = await collectBackup(true, vi.fn(), new AbortController().signal);
    expect(made.liked).toEqual([{ uri: "spotify:track:t1", name: "Song", artists: ["Artist"] }]);
    expect(made.playlists).toMatchObject([{ id: "p1", owned: true, tracksRead: true, tracks: [{ uri: "spotify:track:t1" }] }]);
    expect(made.organizer.pins).toEqual(["p1"]);
    expect(parseBackup(JSON.stringify(made))).toEqual(made);
  });

  it("reads nothing from Spotify when it isn't connected", async () => {
    const made = await collectBackup(false, vi.fn(), new AbortController().signal);
    expect([made.liked, made.playlists]).toEqual([[], []]);
    expect(sp.myPlaylists).not.toHaveBeenCalled();
  });

  it("stops between pages", async () => {
    const stop = new AbortController();
    stop.abort();
    await expect(readCurrent(true, vi.fn(), stop.signal)).rejects.toBeInstanceOf(Stopped);
  });
});

describe("restoring", () => {
  afterEach(() => {
    vi.clearAllMocks();
    smart.list = [];
  });

  it("adds what's missing in batches and never removes anything", async () => {
    const report = await run(backup());
    const saved = vi.mocked(sp.save).mock.calls.map(([batch]) => batch);
    expect(saved.map((b) => b.length)).toEqual([40, 40, 10, 2, 1, 1]);
    expect(saved[0][0]).toBe("spotify:track:track89");
    expect(saved[5]).toEqual(["spotify:playlist:theirs"]);
    expect(sp.createPlaylist).toHaveBeenCalledWith({ name: "old", description: "Two lines", public: true, collaborative: false });
    expect(vi.mocked(sp.addToPlaylist).mock.calls.map(([id, batch]) => [id, batch.length])).toEqual([["new-old", 100], ["new-old", 50]]);
    expect(report.stopped).toBe(false);
    expect(report.done).toMatchObject({ liked: { added: 90, failed: 0 }, albums: { added: 2 }, artists: { added: 1 }, playlists: { added: 2, failed: 0 }, carbon: { added: 1 }, smart: { added: 1 } });
    for (const forbidden of [sp.unsave, sp.deletePlaylist, sp.removeFromPlaylist]) expect(forbidden).not.toHaveBeenCalled();
  });

  it("points smart playlists, tags and pins at the playlists it made again", async () => {
    const report = await run(backup());
    expect(JSON.parse(vi.mocked(smartSet).mock.calls[0][0])).toMatchObject([{ id: "s1", targetId: "new-old" }]);
    expect(smart.list).toHaveLength(1);
    const edit = vi.mocked(organizer.change).mock.calls[0][0];
    expect(edit(emptyLibrary()).tags).toEqual({ "new-old": ["chill"] });
    expect(report.done.organizer).toEqual({ added: 1, failed: 0 });
  });

  it("counts failures and gives up on a list after three failed batches in a row", async () => {
    vi.mocked(sp.save).mockRejectedValue(new Error("offline"));
    vi.mocked(sp.createPlaylist).mockRejectedValueOnce(new Error("offline"));
    const report = await run(backup({ liked: uris("track", 400) }));
    expect(report.done.liked).toEqual({ added: 0, failed: 400 });
    expect(vi.mocked(sp.save).mock.calls.filter(([batch]) => batch[0].startsWith("spotify:track:"))).toHaveLength(3);
    expect(report.done.playlists).toEqual({ added: 0, failed: 2 });
    vi.mocked(sp.save).mockReset().mockResolvedValue(undefined);
  });

  it("does nothing more once stopped", async () => {
    const stop = new AbortController();
    stop.abort();
    const report = await run(backup(), stop.signal);
    expect(report.stopped).toBe(true);
    expect(sp.save).not.toHaveBeenCalled();
    expect(sp.createPlaylist).not.toHaveBeenCalled();
    expect(smartSet).not.toHaveBeenCalled();
    expect(organizer.change).not.toHaveBeenCalled();
  });
});
