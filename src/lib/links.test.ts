import { describe, expect, it } from "vitest";
import { parseLink } from "./links";

const ID = "6rqhFgbbKwnb9MLmUQDhG6";

describe("parseLink", () => {
  it("opens Spotify pages and plays Spotify songs and episodes", () => {
    expect(parseLink(`https://open.spotify.com/album/${ID}?si=abc`)).toEqual({ service: "spotify", what: "album", href: `/album/${ID}` });
    expect(parseLink(`https://open.spotify.com/intl-de/track/${ID}`)).toEqual({ service: "spotify", what: "song", playUri: `spotify:track:${ID}` });
    expect(parseLink(`spotify:playlist:${ID}`)).toEqual({ service: "spotify", what: "playlist", href: `/playlist/${ID}` });
    expect(parseLink(`  spotify:episode:${ID} `)).toEqual({ service: "spotify", what: "episode", playUri: `spotify:episode:${ID}` });
    expect(parseLink(`https://open.spotify.com/show/${ID}`)?.href).toBe(`/show/${ID}`);
    expect(parseLink(`https://open.spotify.com/artist/${ID}`)?.what).toBe("artist");
  });

  it("opens YouTube Music pages and plays its songs", () => {
    expect(parseLink("https://music.youtube.com/watch?v=J7p4bzqLvCw&list=RDAMVM")).toEqual({ service: "youtube", what: "song", playUri: "ytm:video:J7p4bzqLvCw" });
    expect(parseLink("https://youtu.be/J7p4bzqLvCw?t=4")?.playUri).toBe("ytm:video:J7p4bzqLvCw");
    expect(parseLink("https://music.youtube.com/playlist?list=PL123_abc")).toEqual({ service: "youtube", what: "playlist", href: "/youtube/playlist/PL123_abc" });
    expect(parseLink("https://music.youtube.com/browse/MPREb_abc123")?.href).toBe("/youtube/album/MPREb_abc123");
    expect(parseLink("https://music.youtube.com/channel/UCabc123")?.href).toBe("/youtube/artist/UCabc123");
  });

  it("ignores everything else", () => {
    for (const text of ["radiohead", "https://example.com/track/x", `https://open.spotify.com/user/${ID}`, "https://open.spotify.com/track/short", "spotify:track:../x", "https://music.youtube.com/watch?v=<script>", "https://music.youtube.com/browse/FEmusic_home", "http://"])
      expect(parseLink(text), text).toBeNull();
  });
});
