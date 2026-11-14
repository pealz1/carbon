import { describe, expect, it, vi } from "vitest";
import { followLink, type LinkTarget } from "./deep-links";

function follow(target: LinkTarget) {
  const player = { playTracks: vi.fn(), playContext: vi.fn(), playEpisode: vi.fn() };
  const open = vi.fn();
  followLink(target, player, open);
  return { ...player, open };
}

describe("followLink", () => {
  it("opens a page without touching the player", () => {
    const got = follow({ kind: "open", path: "/album/6rqhFgbbKwnb9MLmUQDhG6" });
    expect(got.open).toHaveBeenCalledWith("/album/6rqhFgbbKwnb9MLmUQDhG6");
    expect(got.playTracks).not.toHaveBeenCalled();
    expect(got.playContext).not.toHaveBeenCalled();
  });

  it("plays songs from either service on their own", () => {
    for (const uri of ["spotify:track:6rqhFgbbKwnb9MLmUQDhG6", "ytm:video:dQw4w9WgXcQ"]) {
      const got = follow({ kind: "play", uri });
      expect(got.playTracks).toHaveBeenCalledWith([uri]);
      expect(got.playContext).not.toHaveBeenCalled();
      expect(got.open).not.toHaveBeenCalled();
    }
  });

  it("plays albums, playlists and artists as a context", () => {
    for (const uri of ["spotify:album:6rqhFgbbKwnb9MLmUQDhG6", "spotify:artist:6rqhFgbbKwnb9MLmUQDhG6", "ytm:playlist:PL_abc-123"]) {
      const got = follow({ kind: "play", uri });
      expect(got.playContext).toHaveBeenCalledWith(uri);
      expect(got.playTracks).not.toHaveBeenCalled();
    }
  });

  it("plays podcast episodes as episodes", () => {
    const got = follow({ kind: "play", uri: "spotify:episode:6rqhFgbbKwnb9MLmUQDhG6" });
    expect(got.playEpisode).toHaveBeenCalledWith("spotify:episode:6rqhFgbbKwnb9MLmUQDhG6");
    expect(got.playTracks).not.toHaveBeenCalled();
  });
});
