import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/spotify/endpoints", () => ({ isSaved: vi.fn(), save: vi.fn(), unsave: vi.fn() }));

const sp = await import("$lib/spotify/endpoints");
const { saved } = await import("./saved.svelte");
const { toasts } = await import("./toast.svelte");

describe("saved", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(sp.isSaved).mockReset();
    vi.mocked(sp.save).mockReset();
    vi.mocked(sp.unsave).mockReset();
  });

  it("coalesces lookups from one tick into a single contains call", async () => {
    vi.mocked(sp.isSaved).mockResolvedValue([true, false]);
    saved.want(["spotify:track:a"]);
    saved.want(["spotify:track:b", "spotify:track:a"]);
    expect(saved.has("spotify:track:a")).toBeUndefined();
    await vi.runAllTimersAsync();
    expect(sp.isSaved).toHaveBeenCalledTimes(1);
    expect(sp.isSaved).toHaveBeenCalledWith(["spotify:track:a", "spotify:track:b"]);
    expect(saved.has("spotify:track:a")).toBe(true);
    expect(saved.has("spotify:track:b")).toBe(false);
    saved.want(["spotify:track:a"]);
    await vi.runAllTimersAsync();
    expect(sp.isSaved).toHaveBeenCalledTimes(1);
  });

  it("leaves items unknown when the check fails, so they're asked again later", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(sp.isSaved).mockRejectedValueOnce(new Error("offline"));
    saved.want(["spotify:track:c"]);
    await vi.runAllTimersAsync();
    expect(saved.has("spotify:track:c")).toBeUndefined();
  });

  it("toggles optimistically and keeps the change on success", async () => {
    saved.remember(["spotify:track:d"], false);
    let done!: () => void;
    vi.mocked(sp.save).mockReturnValue(new Promise<void>((resolve) => (done = resolve)));
    const pending = saved.toggle("spotify:track:d");
    expect(saved.has("spotify:track:d")).toBe(true);
    expect(await saved.toggle("spotify:track:d")).toBe(false); // ignored while in flight
    done();
    expect(await pending).toBe(true);
    expect(sp.save).toHaveBeenCalledWith(["spotify:track:d"]);
  });

  it("rolls back and explains when Spotify refuses", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    saved.remember(["spotify:track:e"], true);
    vi.mocked(sp.unsave).mockRejectedValue(new Error("nope"));
    expect(await saved.toggle("spotify:track:e")).toBe(false);
    expect(saved.has("spotify:track:e")).toBe(true);
    expect(toasts.items.at(-1)).toMatchObject({ kind: "error", text: expect.stringMatching(/Couldn't remove/) });
    await vi.runAllTimersAsync();
    expect(toasts.items).toEqual([]);
  });
});
