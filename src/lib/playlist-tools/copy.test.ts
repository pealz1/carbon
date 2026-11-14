import { afterEach, describe, expect, it, vi } from "vitest";
import type { Row } from "./rows";

vi.mock("$lib/spotify/endpoints", () => ({
  createPlaylist: vi.fn(async () => ({ id: "new" })),
  addToPlaylist: vi.fn(async () => {}),
  playlist: vi.fn(async () => ({ description: "Summer\n2024" })),
}));
vi.mock("$lib/session.svelte", () => ({ session: { refreshPlaylists: vi.fn(async () => {}) } }));
vi.mock("$lib/local/playlists.svelte", () => ({
  carbonPlaylists: { error: null, load: vi.fn(async () => {}), find: vi.fn((id: string) => (id === "c1" ? { id, name: "Mix", items: [{ kind: "local", id: "a" }], updatedMs: 1 } : undefined)) },
}));
vi.mock("./tools.svelte", () => ({ createCarbonPlaylist: vi.fn(async () => "c2"), playlistName: (name: string) => name }));

const sp = await import("$lib/spotify/endpoints");
const { session } = await import("$lib/session.svelte");
const { createCarbonPlaylist } = await import("./tools.svelte");
const { createFilled, saveCopy, stoppable, Stopped } = await import("./copy");

const row = (uri: string) => ({ uri, name: uri }) as Row;
const rows = [...Array.from({ length: 120 }, (_, i) => row(`spotify:track:t${i}`)), row("spotify:local:a:b:c:1"), row("")];
const DATED = /^Mix \(\d{4}-\d{2}-\d{2}\)$/;

describe("saving a copy", () => {
  afterEach(() => vi.clearAllMocks());

  it("copies a Spotify playlist's songs in order, with its description, as a private playlist", async () => {
    const progress = vi.fn();
    const copy = await saveCopy({ kind: "playlist", id: "p1", name: "Mix" }, rows, progress);
    expect(sp.createPlaylist).toHaveBeenCalledWith({ name: expect.stringMatching(DATED), description: "Summer 2024", public: false, collaborative: false });
    const batches = vi.mocked(sp.addToPlaylist).mock.calls.map(([id, uris]) => [id, uris.length, uris[0]]);
    expect(batches).toEqual([["new", 100, "spotify:track:t0"], ["new", 20, "spotify:track:t100"]]);
    expect(progress.mock.calls).toEqual([[100], [120]]);
    expect(copy).toMatchObject({ id: "new", added: 120, stopped: false, path: "/playlist/new" });
    expect(session.refreshPlaylists).toHaveBeenCalledTimes(1);
  });

  it("snapshots Liked Songs without asking for a description", async () => {
    const copy = await saveCopy({ kind: "liked", name: "Mix" }, rows.slice(0, 2));
    expect(sp.playlist).not.toHaveBeenCalled();
    expect(copy.added).toBe(2);
  });

  it("copies a Carbon playlist within Carbon, local files included", async () => {
    const copy = await saveCopy({ kind: "carbon", id: "c1", name: "Mix" }, []);
    expect(createCarbonPlaylist).toHaveBeenCalledWith(expect.stringMatching(DATED), [{ kind: "local", id: "a" }]);
    expect(copy).toMatchObject({ id: "c2", added: 1, path: "/carbon/c2" });
    expect(sp.createPlaylist).not.toHaveBeenCalled();
    await expect(saveCopy({ kind: "carbon", id: "gone", name: "Mix" }, [])).rejects.toThrow("doesn't exist");
  });

  it("stops between batches and keeps what was added", async () => {
    const stop = new AbortController();
    const filled = await createFilled({ name: "Mix", description: "", public: false, collaborative: false }, rows.slice(0, 120).map((r) => r.uri), () => stop.abort(), stop.signal);
    expect(filled).toEqual({ id: "new", added: 100, stopped: true });
    expect(sp.addToPlaylist).toHaveBeenCalledTimes(1);
  });

  it("refreshes the sidebar even when adding songs fails", async () => {
    vi.mocked(sp.addToPlaylist).mockRejectedValueOnce(new Error("offline"));
    await expect(createFilled({ name: "Mix", description: "", public: false, collaborative: false }, ["spotify:track:t1"])).rejects.toThrow("offline");
    expect(session.refreshPlaylists).toHaveBeenCalledTimes(1);
  });

  it("turns Stop into an error a paged read can't ignore", () => {
    const stop = new AbortController();
    const onProgress = vi.fn();
    stoppable(stop.signal, onProgress)(1, 2);
    expect(onProgress).toHaveBeenCalledWith(1, 2);
    stop.abort();
    expect(() => stoppable(stop.signal, onProgress)(2, 2)).toThrow(Stopped);
  });
});
