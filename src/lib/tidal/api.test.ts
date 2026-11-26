import { describe, expect, it } from "vitest";
import { mapPage, playerUrl, validId } from "./api";

const track = {
  type: "tracks",
  id: "12345",
  attributes: { title: "One track" },
  relationships: {
    artists: { data: [{ type: "artists", id: "56" }] },
    albums: { data: [{ type: "albums", id: "57" }] },
  },
};
const artwork = { type: "artworks", id: "58" };
const include = [
  track,
  { type: "albums", id: "57", relationships: { coverArt: { data: [artwork] } } },
  { type: "artists", id: "56", attributes: { name: "Artist" } },
  {
    ...artwork,
    attributes: { files: [{ href: "https://resources.tidal.com.evil.test/art" }, { href: "https://resources.tidal.com/picture.jpg" }] },
  },
];

describe("TIDAL JSON:API", () => {
  it("keeps the playlist order and identity of duplicated tracks", () => {
    const page = mapPage({
      data: [
        { type: "tracks", id: "12345", meta: { itemId: "first" } },
        { type: "videos", id: "9876" },
        { type: "tracks", id: "12345", meta: { itemId: "last" } },
      ],
      included: include,
      links: { next: { href: "/v2/playlists/a/relationships/items?page%5Bcursor%5D=bounded" } },
    });
    expect(page.cursor).toBe("bounded");
    expect(page.rows.map(({ title, artist, image, itemId }) => [title, artist, image, itemId])).toEqual([
      ["One track", "Artist", "https://resources.tidal.com/picture.jpg", "first"],
      ["One track", "Artist", "https://resources.tidal.com/picture.jpg", "last"],
    ]);
  });

  it("maps search relationships back to their included resources", () => {
    const page = mapPage({
      data: [{ type: "searchResults", id: "query", relationships: { tracks: { data: [track] } } }],
      included: include,
      links: { next: "https://evil.test/v2/playlists?page%5Bcursor%5D=not-tidal" },
    });
    expect(page.cursor).toBeNull();
    expect(page.rows.map(playerUrl)).toEqual(["https://embed.tidal.com/tracks/12345"]);
    expect(validId("playlist", "../playlists")).toBe(false);
  });
});
