import { invoke } from "@tauri-apps/api/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as soundcloud from "./api";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const native = vi.mocked(invoke);
const song = (id: number, access = "playable") => ({
  urn: `soundcloud:tracks:${id}`,
  title: `Song ${id}`,
  access,
  user: { urn: "soundcloud:users:12", username: "Creator" },
});
const playlist = {
  kind: "playlist", urn: "soundcloud:playlists:14", title: "Evening", user_urn: "soundcloud:users:12",
};

afterEach(() => native.mockReset());

describe("official SoundCloud catalog", () => {
  it("maps track, playlist and artist search results returned with URNs", async () => {
    native.mockImplementation(async (_command, args) => {
      switch ((args as { path: string }).path) {
        case "search/tracks": return { collection: [song(10)] };
        case "search/playlists": return { collection: [playlist] };
        case "search/users": return [{ kind: "user", urn: "soundcloud:users:12", username: "Creator" }];
        default: throw new Error("unexpected request");
      }
    });
    const result = await soundcloud.search("evening");
    expect(result.tracks[0]).toMatchObject({ reason: null, track: { uri: "soundcloud:track:10", artists: [{ uri: "soundcloud:user:12" }] } });
    expect(result.playlists.map((item) => item.uri)).toEqual(["soundcloud:playlist:14"]);
    expect(result.users.map((item) => item.uri)).toEqual(["soundcloud:user:12"]);
  });

  it("reads all SoundCloud playlist pages in order, keeping blocked rows", async () => {
    const next = "https://api.soundcloud.com/playlists/soundcloud:playlists:14/tracks?cursor=next";
    native.mockResolvedValueOnce({ ...playlist, track_count: 3, tracks: [song(10)] })
      .mockResolvedValueOnce({ collection: [song(10), song(3, "blocked")], next_href: next })
      .mockResolvedValueOnce({ collection: [song(5)] });
    const result = await soundcloud.playlist("14");
    expect(result.owner.uri).toBe("soundcloud:user:12");
    expect(result.tracks.map(({ track, reason }) => [track.id, !!reason])).toEqual([["10", false], ["3", true], ["5", false]]);
    expect(native).toHaveBeenLastCalledWith("provider_page", { provider: "soundcloud", address: next, country: "US" });
  });

  it("hydrates a legacy playlist stub by its official track URN", async () => {
    native.mockResolvedValueOnce({ ...playlist, track_count: 2, tracks: [{ id: 5 }, song(10)] })
      .mockRejectedValueOnce("track page unavailable")
      .mockResolvedValueOnce({ collection: [song(5)] });
    expect((await soundcloud.playlist("14")).tracks.map(({ track }) => track.id)).toEqual(["5", "10"]);
    expect(native).toHaveBeenLastCalledWith("soundcloud_get", {
      path: "tracks", params: [["urns", "soundcloud:tracks:5"], ["limit", "30"], ["access", "playable,preview,blocked"]],
    });
  });

  it("maps a saved account playlist after submitting a track change", async () => {
    native.mockResolvedValueOnce(playlist);
    expect(await soundcloud.changePlaylist({ kind: "remove", id: "14", track: "3" })).toMatchObject({ uri: "soundcloud:playlist:14" });
    expect(native).toHaveBeenCalledOnce();
    expect(native).toHaveBeenLastCalledWith("soundcloud_playlist_change", {
      change: { kind: "updateTracks", id: "14", track: "3", add: false },
    });
  });
});
