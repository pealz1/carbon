import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryData } from "./organizer";

vi.mock("$lib/native", () => ({ libraryGet: vi.fn(), librarySet: vi.fn() }));

const native = await import("$lib/native");
const { organizer } = await import("./organizer.svelte");
const { togglePin } = await import("./organizer");
const { toasts } = await import("./toast.svelte");

const lib = (pins: string[]): LibraryData => ({ folders: [], tags: {}, pins });

describe("organizer", () => {
  afterEach(() => {
    vi.mocked(native.librarySet).mockReset();
    toasts.items = [];
  });

  it("loads what Rust saved", async () => {
    vi.mocked(native.libraryGet).mockResolvedValue(lib(["p1"]));
    await organizer.load();
    expect(organizer.data.pins).toEqual(["p1"]);
  });

  it("explains when loading fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(native.libraryGet).mockRejectedValueOnce(new Error("disk gone"));
    await organizer.load();
    expect(toasts.items.at(-1)?.text).toMatch(/disk gone/);
  });

  it("shows a change immediately and saves it", async () => {
    vi.mocked(native.libraryGet).mockResolvedValue(lib([]));
    await organizer.load();
    vi.mocked(native.librarySet).mockImplementation(async (l) => l);
    const saving = organizer.change((l) => togglePin(l, "p2"));
    expect(organizer.data.pins).toEqual(["p2"]);
    expect(await saving).toBe(true);
    expect(native.librarySet).toHaveBeenCalledWith(lib(["p2"]));
  });

  it("refuses invalid edits without saving", async () => {
    expect(await organizer.change(() => { throw new Error("You can pin up to 100 playlists."); })).toBe(false);
    expect(native.librarySet).not.toHaveBeenCalled();
    expect(toasts.items.at(-1)?.text).toMatch(/pin up to/);
  });

  it("rolls back to the saved library when a save fails, dropping queued edits", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(native.libraryGet).mockResolvedValue(lib([]));
    await organizer.load();
    vi.mocked(native.librarySet).mockRejectedValueOnce(new Error("read-only"));
    const first = organizer.change((l) => togglePin(l, "a"));
    const second = organizer.change((l) => togglePin(l, "b"));
    expect(organizer.data.pins).toEqual(["a", "b"]);
    expect(await first).toBe(false);
    expect(await second).toBe(false);
    expect(organizer.data.pins).toEqual([]);
    expect(native.librarySet).toHaveBeenCalledTimes(1);
    expect(toasts.items.at(-1)?.text).toMatch(/Couldn't save/);
  });
});
