// Recorded (signed-out) InnerTube responses, de-noised and shortened. account.json is synthetic:
// its shape follows ytmusicapi's get_account_info parser, since recording one needs a real account.
import { describe, expect, it } from "vitest";
import album from "./fixtures/album.json";
import artist from "./fixtures/artist.json";
import homeMoreRes from "./fixtures/home-more.json";
import home from "./fixtures/home.json";
import lyrics from "./fixtures/lyrics.json";
import next from "./fixtures/next.json";
import playlistMoreRes from "./fixtures/playlist-more.json";
import playlist from "./fixtures/playlist.json";
import searchAlbums from "./fixtures/search-albums.json";
import searchArtists from "./fixtures/search-artists.json";
import searchPlaylists from "./fixtures/search-playlists.json";
import searchSongs from "./fixtures/search-songs.json";
import searchVideos from "./fixtures/search-videos.json";
import searchAll from "./fixtures/search.json";
import { accountOf, albumPage, artistPage, homeMore, homePage, libraryCards, lyricsText, playlistMore, playlistPage, searchResults, upNext } from "./mappers";
import { durationOf, imageOf } from "./parse";

const RADIOHEAD = { id: "UCr_iyUANcn9OX_yy9piYoLw", name: "Radiohead", uri: "ytm:artist:UCr_iyUANcn9OX_yy9piYoLw" };

describe("parse helpers", () => {
  it("reads durations", () => {
    expect(durationOf("4:48")).toBe(288_000);
    expect(durationOf("1:02:03")).toBe(3_723_000);
    expect(durationOf("5M plays")).toBe(0);
  });

  it("asks for large square art when the CDN allows it", () => {
    const thumb = { thumbnails: [{ url: "https://lh3.googleusercontent.com/abc=w60-h60-l90-rj" }, { url: "https://lh3.googleusercontent.com/abc=w120-h120-l90-rj" }] };
    expect(imageOf(thumb)).toBe("https://lh3.googleusercontent.com/abc=w544-h544-l90-rj");
    expect(imageOf({ thumbnails: [{ url: "https://i.ytimg.com/vi/x/hqdefault.jpg" }] })).toBe("https://i.ytimg.com/vi/x/hqdefault.jpg");
    expect(imageOf({ thumbnails: [{ url: "http://insecure.example/a.jpg" }] })).toBeNull();
    expect(imageOf(null)).toBeNull();
  });
});

describe("search", () => {
  it("maps the songs tab", () => {
    const { songs } = searchResults(searchSongs);
    expect(songs).toHaveLength(3);
    expect(songs[0]).toMatchObject({
      id: "NHDOk7lA53w",
      uri: "ytm:video:NHDOk7lA53w",
      name: "Ful Stop",
      artists: [RADIOHEAD],
      album: { id: "MPREb_zwdwliUWiJm", name: "A Moon Shaped Pool", uri: "ytm:album:MPREb_zwdwliUWiJm" },
      durationMs: 368_000,
    });
    expect(songs[0].album?.image).toMatch(/^https:\/\//);
  });

  it("maps videos, albums, artists and playlists tabs", () => {
    expect(searchResults(searchVideos).videos[0]).toMatchObject({ id: "AxtJ_PBC4es", durationMs: 305_000 });
    expect(searchResults(searchAlbums).albums[0]).toMatchObject({
      kind: "album",
      id: "MPREb_yXhSI4FCUo6",
      uri: "ytm:album:MPREb_yXhSI4FCUo6",
      title: "OK Computer",
      subtitle: "Radiohead • 1997",
      playUri: "ytm:album:MPREb_yXhSI4FCUo6",
    });
    expect(searchResults(searchArtists).artists[0]).toMatchObject({ kind: "artist", id: RADIOHEAD.id, title: "Radiohead", subtitle: "Artist" });
    expect(searchResults(searchPlaylists).playlists[0]).toMatchObject({ kind: "playlist", id: "PLUwsfagaCki8ibIU--3oKGVXqhKhl3_SW", title: "Radiohead - Greatest Hits" });
  });

  it("sorts the all-results page by kind and keeps podcasts out", () => {
    const all = searchResults(searchAll);
    expect(all.top).toMatchObject({ kind: "track", id: "u5CVsCnxyXg", title: "No Surprises" });
    expect(all.artists.map((a) => a.title)).toContain("Radiohead");
    expect(all.songs[0]).toMatchObject({ id: "7374CZQoS2Y", name: "No Surprises", artists: [RADIOHEAD] });
    expect(all.videos.length).toBeGreaterThan(0);
    expect(all.albums.length).toBeGreaterThan(0);
    expect([...all.songs, ...all.videos].map((t) => t.id)).not.toContain("-1tLaFPzpMM");
  });
});

describe("pages", () => {
  it("maps home shelves and follows their continuation", () => {
    const first = homePage(home);
    expect(first.shelves.map((s) => s.title)).toEqual(["Low key vibes", "Throwbacks"]);
    expect(first.shelves[1].cards[0]).toMatchObject({
      kind: "playlist",
      id: "RDCLAK5uy_lMzHW51iFg1Kx0d_2EHpzbOgCrwtu8cgI",
      uri: "ytm:playlist:RDCLAK5uy_lMzHW51iFg1Kx0d_2EHpzbOgCrwtu8cgI",
      title: "The Hits: '80s",
      subtitle: "Michael Jackson, Madonna, Prince, Starship",
    });
    expect(first.continuation).toMatch(/^4qmF/);
    const more = homeMore(homeMoreRes);
    expect(more.shelves.map((s) => s.title)).toEqual(["Pump it up", "Mindful instrumentals", "Irresistible sing-alongs"]);
    expect(more.continuation).toMatch(/^4qmF/);
    expect(homeMore({})).toEqual({ shelves: [], continuation: null });
  });

  it("maps an album with its artists filled into every track", () => {
    const a = albumPage(album, "MPREb_yXhSI4FCUo6");
    expect(a).toMatchObject({ name: "OK Computer", type: "Album", year: "1997", artists: [RADIOHEAD] });
    expect(a.description).toMatch(/^OK Computer is the third studio album/);
    expect(a.largeImage).toMatch(/=w1200-h1200/);
    expect(a.tracks[0]).toMatchObject({ name: "Airbag", durationMs: 288_000, artists: [RADIOHEAD], setVideoId: "E09F47EBF57B19B1" });
    expect(a.tracks[0].album).toMatchObject({ id: "MPREb_yXhSI4FCUo6", name: "OK Computer" });
  });

  it("maps a playlist and its continuation", () => {
    const p = playlistPage(playlist, "PLUwsfagaCki8ibIU--3oKGVXqhKhl3_SW");
    expect(p).toMatchObject({ name: "Radiohead - Greatest Hits", ownerName: "Ali Aideel Ismail", trackCount: 28, owned: false, continuation: null });
    expect(p.tracks[0]).toMatchObject({ id: "zFYEYRcjK2g", name: "Creep", durationMs: 239_000, setVideoId: "56B44F6D10557CC6" });
    const more = playlistMore(playlistMoreRes);
    expect(more.tracks).toHaveLength(2);
    expect(more.continuation).toMatch(/^4qmF/);
  });

  it("maps an artist", () => {
    const a = artistPage(artist, RADIOHEAD.id);
    expect(a.name).toBe("Radiohead");
    expect(a.songs[0]).toMatchObject({ name: "Creep", artists: [RADIOHEAD], album: { name: "Pablo Honey" } });
    const titles = a.shelves.map((s) => s.title);
    expect(titles).toEqual(expect.arrayContaining(["Albums", "Singles & EPs", "Videos", "Fans might also like"]));
    expect(a.shelves.find((s) => s.title === "Videos")?.cards[0]).toMatchObject({ kind: "track", id: "XFkzRNyygfk" });
  });

  it("maps up next and finds the lyrics page", () => {
    const n = upNext(next);
    expect(n.tracks[0]).toMatchObject({ id: "7374CZQoS2Y", name: "No Surprises", durationMs: 229_000, artists: [RADIOHEAD] });
    expect(n.tracks[0].album).toMatchObject({ id: "MPREb_b9Yfli6Cg79" });
    expect(n.lyricsId).toBe("MPLYt_b9Yfli6Cg79-10");
    expect(lyricsText(lyrics)).toMatch(/^First placeholder line\n/);
    expect(lyricsText({})).toBeNull();
  });
});

describe("account and library", () => {
  it("reads the account menu", () => {
    const res = {
      actions: [
        {
          openPopupAction: {
            popup: {
              multiPageMenuRenderer: {
                header: {
                  activeAccountHeaderRenderer: {
                    accountName: { runs: [{ text: "Sam Listener" }] },
                    channelHandle: { runs: [{ text: "@samlistens" }] },
                    accountPhoto: { thumbnails: [{ url: "https://yt3.ggpht.com/photo=s88-c-k" }] },
                  },
                },
              },
            },
          },
        },
      ],
    };
    expect(accountOf(res)).toEqual({ name: "Sam Listener", handle: "@samlistens", image: "https://yt3.ggpht.com/photo=s88-c-k" });
    expect(accountOf({})).toBeNull();
  });

  it("collects cards from library grids and lists, skipping the 'new playlist' tile", () => {
    const tile = (browseId: string, pageType: string, title: string) => ({
      musicTwoRowItemRenderer: {
        title: { runs: [{ text: title }] },
        subtitle: { runs: [{ text: "Playlist" }, { text: " • " }, { text: "12 songs" }] },
        navigationEndpoint: { browseEndpoint: { browseId, browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType } } } },
      },
    });
    const res = {
      contents: {
        singleColumnBrowseResultsRenderer: {
          tabs: [
            {
              tabRenderer: {
                content: {
                  sectionListRenderer: {
                    contents: [
                      {
                        gridRenderer: {
                          items: [
                            { musicTwoRowItemRenderer: { title: { runs: [{ text: "New playlist" }] }, navigationEndpoint: { createPlaylistEndpoint: {} } } },
                            tile("VLLM", "MUSIC_PAGE_TYPE_PLAYLIST", "Liked Music"),
                            tile("VLPLmine", "MUSIC_PAGE_TYPE_PLAYLIST", "Road trip"),
                          ],
                        },
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    };
    expect(libraryCards(res).map((c) => [c.id, c.title, c.subtitle])).toEqual([
      ["LM", "Liked Music", ""],
      ["PLmine", "Road trip", ""],
    ]);
  });
});
