import { describe, expect, it, vi } from "vitest";
import { tokenPager } from "./pager";

describe("tokenPager", () => {
  it("follows continuation tokens page by page and stops at the end", async () => {
    const more = vi.fn(async (token: string) => (token === "t1" ? { items: [3, 4], continuation: "t2" } : { items: [5], continuation: null }));
    const pager = tokenPager(async () => ({ items: [1, 2], continuation: "t1" }), more);
    await pager.more();
    await pager.more();
    await pager.more();
    expect(pager.items).toEqual([1, 2, 3, 4, 5]);
    expect(more.mock.calls.map(([t]) => t)).toEqual(["t1", "t2"]);
    expect(pager.done).toBe(true);
  });

  it("treats an empty page that still has a token as the end, so it can't loop", async () => {
    const more = vi.fn(async () => ({ items: [], continuation: "again" }));
    const pager = tokenPager(async () => ({ items: [1], continuation: "t1" }), more);
    await pager.more();
    await pager.more();
    expect(pager.done).toBe(true);
    await pager.more();
    expect(more).toHaveBeenCalledTimes(1);
  });
});
