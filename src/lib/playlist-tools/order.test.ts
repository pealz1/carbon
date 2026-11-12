import { describe, expect, it } from "vitest";
import { applyMove, findDuplicates, planMoves, planRemoval, restoreMoves, rowKeys, sortedOrder, type Move } from "./order";
import type { Row } from "./rows";

const row = (name: string, over: Partial<Row> = {}): Row => ({
  uri: `spotify:track:${name}`,
  name,
  artists: ["Artist"],
  album: "Album",
  durationMs: 1000,
  addedAt: null,
  releaseDate: null,
  isrc: null,
  explicit: false,
  path: null,
  track: null,
  ...over,
});

const run = <T,>(list: T[], moves: Move[]): T[] => moves.reduce<T[]>((acc, m) => applyMove(acc, m), list);

function shuffled(n: number, seed: number): number[] {
  const out = Array.from({ length: n }, (_, i) => i);
  let s = seed;
  for (let i = n - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

describe("Spotify's reorder", () => {
  it("counts insert_before from before the move", () => {
    expect(applyMove([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], { rangeStart: 0, insertBefore: 10, rangeLength: 1 })).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 0]);
    expect(applyMove(["a", "b", "c", "d"], { rangeStart: 2, insertBefore: 0, rangeLength: 2 })).toEqual(["c", "d", "a", "b"]);
    expect(applyMove(["a", "b", "c", "d"], { rangeStart: 0, insertBefore: 3, rangeLength: 2 })).toEqual(["c", "a", "b", "d"]);
  });
});

describe("planMoves", () => {
  it("reaches the target for any order", () => {
    for (let seed = 1; seed < 60; seed++) {
      const n = 1 + (seed % 37);
      const current = shuffled(n, seed);
      const target = shuffled(n, seed * 7 + 3);
      expect(run(current, planMoves(current, target))).toEqual(target);
    }
  });

  it("moves only what's out of place, and blocks that travel together in one call", () => {
    expect(planMoves([0, 1, 2, 3], [0, 1, 2, 3])).toEqual([]);
    expect(planMoves([1, 2, 3, 0], [0, 1, 2, 3])).toHaveLength(1);
    expect(planMoves([4, 5, 0, 1, 2, 3], [0, 1, 2, 3, 4, 5])).toEqual([{ rangeStart: 0, insertBefore: 6, rangeLength: 2 }]);
    expect(planMoves([3, 2, 1, 0], [0, 1, 2, 3])).toHaveLength(3);
  });

  it("restores the earlier order, or refuses when the playlist changed", () => {
    const before = [row("a"), row("b"), row("a"), row("c")];
    const now = [before[3], before[2], before[0], before[1]];
    const moves = restoreMoves(rowKeys(now), rowKeys(before))!;
    expect(run(rowKeys(now), moves)).toEqual(rowKeys(before));
    expect(restoreMoves(rowKeys([...now, row("new")]), rowKeys(before))).toBeNull();
  });
});

describe("sortedOrder", () => {
  const rows = [
    row("Beta", { artists: ["Zed"], durationMs: 300, addedAt: "2024-02-01", releaseDate: "2001" }),
    row("alpha", { artists: ["Ann"], album: "B", durationMs: 100, addedAt: "2024-03-01", releaseDate: null }),
    row("Unavailable", { uri: "" }),
    row("Gamma 10", { artists: ["Ann"], album: "A", durationMs: 200, addedAt: null, releaseDate: "1999-05" }),
    row("Gamma 9", { artists: ["Ann"], album: "A", durationMs: 200, addedAt: "2024-01-01", releaseDate: "2010-01-01" }),
  ];

  it("sorts by each key, case-insensitively and with numbers in order", () => {
    expect(sortedOrder(rows, "title")).toEqual([1, 0, 4, 3, 2]);
    expect(sortedOrder(rows, "artist")).toEqual([3, 4, 1, 0, 2]);
    expect(sortedOrder(rows, "duration", true)).toEqual([0, 3, 4, 1, 2]);
  });

  it("keeps rows without a value last in either direction", () => {
    expect(sortedOrder(rows, "added")).toEqual([4, 0, 1, 3, 2]);
    expect(sortedOrder(rows, "added", true)).toEqual([1, 0, 4, 3, 2]);
    expect(sortedOrder(rows, "released", true)).toEqual([4, 0, 3, 1, 2]);
  });
});

describe("duplicates", () => {
  it("finds repeats by URI and by ISRC, never local files", () => {
    const rows = [
      row("a", { isrc: "X1" }),
      row("b", { isrc: "X1" }),
      row("a"),
      row("local", { uri: "spotify:local:x" }),
      row("local", { uri: "spotify:local:x" }),
      row("c"),
    ];
    expect(findDuplicates(rows)).toEqual([
      { index: 1, of: 0, reason: "isrc" },
      { index: 2, of: 0, reason: "uri" },
    ]);
  });

  it("deletes every copy, then puts kept copies back where they were", () => {
    const uris = ["a", "b", "a", "c", "a", "b", "d"];
    const remove = new Set([2, 4, 5]);
    const plan = planRemoval(uris, remove);
    expect(plan.deletes.sort()).toEqual(["a", "b"]);
    let list = uris.filter((u) => !plan.deletes.includes(u));
    for (const { uris: add, position } of plan.inserts) list = [...list.slice(0, position), ...add, ...list.slice(position)];
    expect(list).toEqual(uris.filter((_, i) => !remove.has(i)));
    expect(plan.inserts).toEqual([{ uris: ["a", "b"], position: 0 }]);
  });
});
