import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlaylistSummary } from "./spotify/types";

vi.mock("$lib/native", () => ({ libraryGet: vi.fn(), librarySet: vi.fn(async (l: unknown) => l) }));
vi.mock("$lib/spotify/endpoints", () => ({
  createPlaylist: vi.fn(async () => ({ id: "new" })),
  updatePlaylist: vi.fn(),
  uploadPlaylistCover: vi.fn(),
  addToPlaylist: vi.fn(),
  removeFromPlaylist: vi.fn(),
  deletePlaylist: vi.fn(),
}));
vi.mock("$lib/session.svelte", () => ({ session: { refreshPlaylists: vi.fn(async () => {}) } }));

const sp = await import("$lib/spotify/endpoints");
const { session } = await import("$lib/session.svelte");
const { organizer } = await import("./organizer.svelte");
const { toasts } = await import("./toast.svelte");
const { addTracks, deletePlaylist, editablePlaylists, removeTracks, savePlaylist } = await import("./playlist-actions");

const draft = { name: " Road trip ", description: "", public: true, collaborative: true };
const summary = (id: string, ownerId = "me", collaborative = false) => ({ id, name: id, ownerId, collaborative }) as PlaylistSummary;

describe("playlist actions", () => {
  afterEach(() => vi.clearAllMocks());

  it("creates a private collaborative playlist, adds songs and uploads the cover", async () => {
    const result = await savePlaylist(null, draft, "QUJD", ["spotify:track:1"]);
    expect(result).toEqual({ id: "new", coverError: null });
    expect(sp.createPlaylist).toHaveBeenCalledWith({ name: "Road trip", description: "", public: false, collaborative: true });
    expect(sp.addToPlaylist).toHaveBeenCalledWith("new", ["spotify:track:1"]);
    expect(sp.uploadPlaylistCover).toHaveBeenCalledWith("new", "QUJD");
    expect(session.refreshPlaylists).toHaveBeenCalled();
  });

  it("updates in place and reports a failed cover separately", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(sp.uploadPlaylistCover).mockRejectedValueOnce(new Error("too big"));
    vi.mocked(session.refreshPlaylists).mockRejectedValueOnce(new Error("offline"));
    const result = await savePlaylist("p1", draft, "QUJD");
    expect(sp.createPlaylist).not.toHaveBeenCalled();
    expect(sp.updatePlaylist).toHaveBeenCalledWith("p1", expect.objectContaining({ name: "Road trip" }));
    expect(result.coverError).toMatch(/cover didn't: too big/);
  });

  it("deletes a playlist and forgets it in folders and pins", async () => {
    await organizer.change((lib) => ({ ...lib, pins: ["gone"] }));
    expect(await deletePlaylist(summary("gone"))).toBe(true);
    expect(organizer.data.pins).toEqual([]);
    expect(toasts.items.at(-1)?.text).toMatch(/Removed gone/);
  });

  it("keeps everything when Spotify refuses the delete", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(sp.deletePlaylist).mockRejectedValueOnce(new Error("nope"));
    expect(await deletePlaylist(summary("kept"))).toBe(false);
    expect(toasts.items.at(-1)).toMatchObject({ kind: "error" });
  });

  it("adds and removes songs with plain feedback", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await addTracks(summary("p"), ["a", "b"])).toBe(true);
    expect(toasts.items.at(-1)?.text).toBe("Added 2 songs to p.");
    vi.mocked(sp.addToPlaylist).mockRejectedValueOnce(new Error("x"));
    expect(await addTracks(summary("p"), ["a"])).toBe(false);
    expect(await removeTracks(summary("p"), ["a"])).toBe(true);
    vi.mocked(sp.removeFromPlaylist).mockRejectedValueOnce(new Error("x"));
    expect(await removeTracks(summary("p"), ["a"])).toBe(false);
  });

  it("lists playlists you own or collaborate on", () => {
    const lists = [summary("mine"), summary("theirs", "you"), summary("shared", "you", true)];
    expect(editablePlaylists(lists, "me").map((p) => p.id)).toEqual(["mine", "shared"]);
  });
});
