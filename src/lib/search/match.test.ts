import { describe, expect, it, vi } from "vitest";
import type { Track } from "$lib/spotify/types";
import { matchSong, rank, similarity, termOf } from "./match";

const track = (name: string, artist: string, durationMs = 200_000, id = name): Track => ({
  id,
  uri: `ytm:video:${id}`,
  name,
  artists: [{ id: "", name: artist, uri: "" }],
  album: null,
  durationMs,
  explicit: false,
});
const song = { title: "Get Lucky", artist: "Daft Punk", durationMs: 200_000 };

describe("matching a song on another source", () => {
  it("compares names by the words they share, whatever the case, accents or punctuation", () => {
    expect(similarity("São Paulo!", "sao paulo")).toBe(1);
    expect(similarity("Get Lucky", "Get Lucky (Radio Edit)")).toBeCloseTo(2 / 3);
    expect(similarity("", "anything")).toBe(0);
  });

  it("searches for the title and artist together, and ranks what comes back", async () => {
    const search = vi.fn().mockResolvedValue([track("Something Else", "Nobody"), track("Get Lucky", "Daft Punk")]);
    const match = await matchSong(song, search);
    expect(search).toHaveBeenCalledWith("Get Lucky Daft Punk");
    expect(match.selected?.name).toBe("Get Lucky");
    expect(termOf({ ...song, artist: "" })).toBe("Get Lucky");
  });

  it("selects nothing unless one recording is clearly the song", () => {
    expect(rank(song, []).selected).toBeNull();
    expect(rank(song, [track("Get Lucky", "Daft Punk", 400_000)]).reason).toBe("Different duration");
    expect(rank(song, [track("Get Lucky", "Daft Punk", 200_000, "a"), track("Get Lucky", "Daft Punk", 200_000, "b")]).selected).toBeNull();
    expect(rank(song, [track("Get Lucky", "Someone Covering")]).selected).toBeNull();
  });

  it("passes a failed search on to the caller", async () => {
    await expect(matchSong(song, () => Promise.reject(new Error("offline")))).rejects.toThrow("offline");
  });
});
