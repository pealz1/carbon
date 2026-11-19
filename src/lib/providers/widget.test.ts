import { expect, it, vi } from "vitest";
import { completeSounds } from "./widget";
it("fills public widget ID-only entries in order and preserves unavailable rows", async () => {
  const lookup = vi.fn(async (id: string) =>
    id === "1" ? { title: "Song by Band", author: "Band", image: "https://i1.sndcdn.com/cover.jpg" } : null,
  );
  const songs = await completeSounds(
    [{ id: "1" }, { id: "2", title: "Known", artist: "A", durationMs: 50 }, { id: "1" }, { id: "3" }],
    undefined,
    lookup,
  );
  expect(songs.map((s) => s.title)).toEqual(["Song", "Known", "Song", "Unavailable SoundCloud track"]);
  expect(songs[0].image).toMatch(/cover.jpg$/);
  expect(songs[3].unavailable).toBe(true);
  expect(lookup).toHaveBeenCalledTimes(2);
});
