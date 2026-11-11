// InnerTube responses -> Carbon view models. Page layouts as parsed by sigma67/ytmusicapi (MIT);
// see THIRD_PARTY_NOTICES.md. Everything optional: YouTube reshapes these without notice.
import type { AlbumRef, ArtistRef, Card } from "$lib/spotify/types";
import {
  albumFrom,
  artistsFrom,
  durationOf,
  imageOf,
  isExplicit,
  likeStatusOf,
  pageTypeOf,
  runsOf,
  segmentsOf,
  textOf,
  trackCard,
  trackOf,
  videoTypeOf,
  type Json,
  type YtTrack,
} from "./parse";
import { ytmUri } from "./uri";

export type { YtTrack } from "./parse";

export interface Shelf {
  title: string;
  cards: Card[];
}

export interface SearchResults {
  top: Card | null;
  songs: YtTrack[];
  videos: YtTrack[];
  albums: Card[];
  artists: Card[];
  playlists: Card[];
}

export interface YtAlbum {
  id: string;
  uri: string;
  name: string;
  type: string;
  year: string;
  artists: ArtistRef[];
  /** The lead artist's photo, for the byline. */
  artistImage: string | null;
  image: string | null;
  largeImage: string | null;
  description: string;
  tracks: YtTrack[];
}

export interface TrackPage {
  tracks: YtTrack[];
  /** Token for the next page, or null at the end. */
  continuation: string | null;
}

export interface YtPlaylist extends TrackPage {
  id: string;
  uri: string;
  name: string;
  description: string;
  image: string | null;
  largeImage: string | null;
  ownerName: string;
  trackCount: number | null;
  /** Your own playlist: renaming, deleting and removing songs are allowed. */
  owned: boolean;
}

export interface YtArtist {
  id: string;
  uri: string;
  name: string;
  image: string | null;
  largeImage: string | null;
  songs: YtTrack[];
  shelves: Shelf[];
}

export interface UpNext {
  tracks: YtTrack[];
  /** Browse id of the song's lyrics page, when YouTube Music has lyrics. */
  lyricsId: string | null;
}

export interface YtAccount {
  name: string;
  handle: string | null;
  image: string | null;
}

/** Songs ("art tracks") and music videos; podcast episodes are left out. */
const MUSIC_VIDEO_TYPES = new Set(["MUSIC_VIDEO_TYPE_ATV", "MUSIC_VIDEO_TYPE_OMV", "MUSIC_VIDEO_TYPE_UGC", "MUSIC_VIDEO_TYPE_OFFICIAL_SOURCE_MUSIC"]);
const TYPE_LABELS = new Set(["Song", "Video", "Album", "Single", "EP", "Playlist", "Artist", "Episode", "Profile", "Podcast"]);
const STAT = /\b(views?|plays?|monthly audience|subscribers?|songs?|tracks?)$/;

const artOnly = (image: string | null): AlbumRef | null => (image ? { id: "", name: "", uri: "", image } : null);

function kindOf(pageType: string): "album" | "playlist" | "artist" | null {
  if (pageType === "MUSIC_PAGE_TYPE_ALBUM") return "album";
  if (pageType === "MUSIC_PAGE_TYPE_PLAYLIST") return "playlist";
  if (pageType === "MUSIC_PAGE_TYPE_ARTIST") return "artist";
  return null;
}

function cardFrom(kind: "album" | "playlist" | "artist", browseId: string, title: string, subtitle: string, image: string | null): Card {
  const id = kind === "playlist" ? browseId.replace(/^VL/, "") : browseId;
  const uri = ytmUri(kind, id);
  return { kind, id, uri, title, subtitle, image, playUri: uri };
}

/** A card's second line without the leading type label and play counts. */
function subtitleOf(t: Json, kind: string): string {
  if (kind === "artist") return "Artist";
  return segmentsOf(t)
    .filter((s, i) => !(i === 0 && TYPE_LABELS.has(s)) && !STAT.test(s))
    .join(" • ");
}

/** Unlinked artist names (some rows only have text): the first segment that isn't a label or stat. */
function plainArtists(t: Json): ArtistRef[] {
  const name = segmentsOf(t).find((s) => !TYPE_LABELS.has(s) && !STAT.test(s) && !durationOf(s));
  return name ? [{ id: "", name, uri: "" }] : [];
}

const flexColumns = (row: Json): Json[] => (row?.flexColumns ?? []).map((c: Json) => c?.musicResponsiveListItemFlexColumnRenderer?.text);
const playEndpoint = (row: Json): Json => row?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint;

/** A song or video row (musicResponsiveListItemRenderer). `context` fills what album pages leave out. */
export function rowTrack(row: Json, context: { artists?: ArtistRef[]; album?: AlbumRef | null } = {}): YtTrack | null {
  const cols = flexColumns(row);
  const titleNav = runsOf(cols[0])[0]?.navigationEndpoint;
  const videoId: string | undefined = row?.playlistItemData?.videoId ?? playEndpoint(row)?.watchEndpoint?.videoId ?? titleNav?.watchEndpoint?.videoId;
  if (!videoId || row?.musicItemRendererDisplayPolicy === "MUSIC_ITEM_RENDERER_DISPLAY_POLICY_GREY_OUT") return null;
  const type = videoTypeOf(playEndpoint(row)) || videoTypeOf(titleNav);
  if (type && !MUSIC_VIDEO_TYPES.has(type)) return null;
  const runs = cols.slice(1).flatMap(runsOf);
  const fixed = (row?.fixedColumns ?? []).map((c: Json) => textOf(c?.musicResponsiveListItemFixedColumnRenderer?.text));
  const image = imageOf(row?.thumbnail) ?? context.album?.image ?? null;
  const linked = artistsFrom(runs);
  return trackOf({
    videoId,
    name: textOf(cols[0]),
    artists: linked.length ? linked : (context.artists ?? plainArtists(cols[1])),
    album: albumFrom(runs, image) ?? context.album ?? artOnly(image),
    durationMs: [...cols.slice(1).flatMap(segmentsOf), ...fixed].map(durationOf).find(Boolean) ?? 0,
    explicit: isExplicit(row),
    setVideoId: row?.playlistItemData?.playlistSetVideoId,
    liked: likeStatusOf(row),
  });
}

/** An album, playlist or artist row. */
export function rowCard(row: Json): Card | null {
  const nav = row?.navigationEndpoint;
  const kind = kindOf(pageTypeOf(nav));
  if (!kind) return null;
  const cols = flexColumns(row);
  return cardFrom(kind, nav.browseEndpoint.browseId, textOf(cols[0]), subtitleOf(cols[1], kind), imageOf(row?.thumbnail));
}

/** A tile on a shelf (musicTwoRowItemRenderer): a song/video, album, playlist or artist. */
export function twoRowCard(item: Json): Card | null {
  const nav = item?.navigationEndpoint;
  const title = textOf(item?.title);
  const image = imageOf(item?.thumbnailRenderer);
  const videoId: string | undefined = nav?.watchEndpoint?.videoId;
  if (videoId) {
    const type = videoTypeOf(nav);
    if (type && !MUSIC_VIDEO_TYPES.has(type)) return null;
    const runs = runsOf(item?.subtitle);
    const linked = artistsFrom(runs);
    return trackCard(trackOf({ videoId, name: title, artists: linked.length ? linked : plainArtists(item?.subtitle), album: artOnly(image), durationMs: 0 }));
  }
  const kind = kindOf(pageTypeOf(nav));
  return kind ? cardFrom(kind, nav.browseEndpoint.browseId, title, subtitleOf(item?.subtitle, kind), image) : null;
}

function itemCard(item: Json): Card | null {
  if (item?.musicTwoRowItemRenderer) return twoRowCard(item.musicTwoRowItemRenderer);
  const row = item?.musicResponsiveListItemRenderer;
  if (!row) return null;
  const track = rowTrack(row);
  return rowCard(row) ?? (track && trackCard(track));
}

function shelvesOf(sections: Json[]): Shelf[] {
  return sections
    .map((s) => s?.musicCarouselShelfRenderer)
    .filter(Boolean)
    .map((shelf) => ({
      title: textOf(shelf.header?.musicCarouselShelfBasicHeaderRenderer?.title),
      cards: (shelf.contents ?? []).map(itemCard).filter((c: Card | null): c is Card => c !== null),
    }))
    .filter((s) => s.title && s.cards.length);
}

const sectionListOf = (res: Json): Json => res?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer;
const sectionsOf = (res: Json): Json[] => sectionListOf(res)?.contents ?? [];

export interface ShelfPage {
  shelves: Shelf[];
  /** Token for more shelves, or null at the end. */
  continuation: string | null;
}

const shelfPage = (list: Json): ShelfPage => ({
  shelves: shelvesOf(list?.contents ?? []),
  continuation: list?.continuations?.[0]?.nextContinuationData?.continuation ?? null,
});

export const homePage = (res: Json): ShelfPage => shelfPage(sectionListOf(res));
/** More home shelves, from a continuation token. */
export const homeMore = (res: Json): ShelfPage => shelfPage(res?.continuationContents?.sectionListContinuation);

function topCard(card: Json): Card | null {
  const run = runsOf(card?.title)[0];
  const nav = run?.navigationEndpoint ?? card?.onTap;
  const image = imageOf(card?.thumbnail);
  const videoId: string | undefined = nav?.watchEndpoint?.videoId;
  if (videoId) {
    const runs = runsOf(card?.subtitle);
    return trackCard(trackOf({ videoId, name: textOf(card.title), artists: artistsFrom(runs), album: albumFrom(runs, image) ?? artOnly(image), durationMs: 0 }));
  }
  const kind = kindOf(pageTypeOf(nav));
  return kind ? cardFrom(kind, nav.browseEndpoint.browseId, textOf(card.title), subtitleOf(card.subtitle, kind), image) : null;
}

/** Search results, split by kind. Works for the all-results page and every filter tab. */
export function searchResults(res: Json): SearchResults {
  const out: SearchResults = { top: null, songs: [], videos: [], albums: [], artists: [], playlists: [] };
  const sections: Json[] = res?.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents ?? [];
  for (const section of sections) {
    if (section?.musicCardShelfRenderer) out.top ??= topCard(section.musicCardShelfRenderer);
    for (const item of (section?.musicShelfRenderer ?? section?.itemSectionRenderer)?.contents ?? []) {
      const row = item?.musicResponsiveListItemRenderer;
      const card = row && rowCard(row);
      if (card) {
        ({ album: out.albums, artist: out.artists, playlist: out.playlists }) [card.kind as "album" | "artist" | "playlist"].push(card);
        continue;
      }
      const track = row && rowTrack(row);
      if (!track) continue;
      const type = videoTypeOf(playEndpoint(row)) || videoTypeOf(runsOf(flexColumns(row)[0])[0]?.navigationEndpoint);
      (type === "MUSIC_VIDEO_TYPE_ATV" ? out.songs : out.videos).push(track);
    }
  }
  return out;
}

const headerOf = (res: Json): Json => {
  const first = res?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0];
  return first?.musicResponsiveHeaderRenderer ?? first?.musicEditablePlaylistDetailHeaderRenderer?.header?.musicResponsiveHeaderRenderer;
};

const secondaryOf = (res: Json): Json => res?.contents?.twoColumnBrowseResultsRenderer?.secondaryContents?.sectionListRenderer?.contents?.[0];

const descriptionOf = (header: Json): string => textOf(header?.description?.musicDescriptionShelfRenderer?.description).trim();

export function albumPage(res: Json, id: string): YtAlbum {
  const header = headerOf(res);
  const name = textOf(header?.title);
  const segments = segmentsOf(header?.subtitle);
  const artists = artistsFrom(runsOf(header?.straplineTextOne));
  const image = imageOf(header?.thumbnail);
  const album: AlbumRef = { id, name, uri: ytmUri("album", id), image };
  const rows: Json[] = secondaryOf(res)?.musicShelfRenderer?.contents ?? [];
  return {
    id,
    uri: album.uri,
    name,
    type: segments[0] ?? "Album",
    year: segments.find((s) => /^\d{4}$/.test(s)) ?? "",
    artists,
    artistImage: imageOf(header?.straplineThumbnail),
    image,
    largeImage: imageOf(header?.thumbnail),
    description: descriptionOf(header),
    tracks: rows.map((r) => rowTrack(r?.musicResponsiveListItemRenderer, { artists, album })).filter((t): t is YtTrack => t !== null),
  };
}

/** Rows plus the continuation token a long list ends with. */
export function trackPage(items: Json[]): TrackPage {
  return {
    tracks: items.map((i) => rowTrack(i?.musicResponsiveListItemRenderer)).filter((t): t is YtTrack => t !== null),
    continuation: items.at(-1)?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token ?? null,
  };
}

export function playlistPage(res: Json, id: string): YtPlaylist {
  const header = headerOf(res);
  const first = res?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0];
  const count = /([\d,]+) (?:songs?|tracks?)/.exec(textOf(header?.secondSubtitle))?.[1];
  return {
    id,
    uri: ytmUri("playlist", id),
    name: textOf(header?.title),
    description: descriptionOf(header),
    image: imageOf(header?.thumbnail),
    largeImage: imageOf(header?.thumbnail),
    ownerName: header?.facepile?.avatarStackViewModel?.text?.content ?? textOf(header?.straplineTextOne),
    trackCount: count ? Number(count.replace(/,/g, "")) : null,
    owned: Boolean(first?.musicEditablePlaylistDetailHeaderRenderer),
    ...trackPage(secondaryOf(res)?.musicPlaylistShelfRenderer?.contents ?? []),
  };
}

/** The next page of a playlist (from a continuation token). */
export const playlistMore = (res: Json): TrackPage => trackPage(res?.onResponseReceivedActions?.[0]?.appendContinuationItemsAction?.continuationItems ?? []);

export function artistPage(res: Json, id: string): YtArtist {
  const header = res?.header?.musicImmersiveHeaderRenderer ?? res?.header?.musicVisualHeaderRenderer;
  const sections = sectionsOf(res);
  const songRows: Json[] = sections.find((s) => s?.musicShelfRenderer)?.musicShelfRenderer?.contents ?? [];
  return {
    id,
    uri: ytmUri("artist", id),
    name: textOf(header?.title),
    image: imageOf(header?.thumbnail),
    largeImage: imageOf(header?.thumbnail),
    songs: songRows.map((r) => rowTrack(r?.musicResponsiveListItemRenderer)).filter((t): t is YtTrack => t !== null),
    shelves: shelvesOf(sections),
  };
}

function panelTrack(p: Json): YtTrack | null {
  if (!p?.videoId) return null;
  const runs = runsOf(p.longBylineText);
  const image = imageOf(p.thumbnail);
  const linked = artistsFrom(runs);
  return trackOf({
    videoId: p.videoId,
    name: textOf(p.title),
    artists: linked.length ? linked : plainArtists(p.longBylineText),
    album: albumFrom(runs, image) ?? artOnly(image),
    durationMs: durationOf(textOf(p.lengthText)),
    explicit: isExplicit(p),
  });
}

/** The watch-next queue (a song's radio, or a playlist from a song) and where its lyrics are. */
export function upNext(res: Json): UpNext {
  const tabs: Json[] = res?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs ?? [];
  const panel = tabs[0]?.tabRenderer?.content?.musicQueueRenderer?.content?.playlistPanelRenderer;
  const items: Json[] = panel?.contents ?? [];
  const tracks = items
    .map((i) => panelTrack(i?.playlistPanelVideoRenderer ?? i?.playlistPanelVideoWrapperRenderer?.primaryRenderer?.playlistPanelVideoRenderer))
    .filter((t): t is YtTrack => t !== null);
  const lyrics = tabs.map((t) => t?.tabRenderer).find((t) => !t?.unselectable && pageTypeOf(t?.endpoint) === "MUSIC_PAGE_TYPE_TRACK_LYRICS");
  return { tracks, lyricsId: lyrics?.endpoint?.browseEndpoint?.browseId ?? null };
}

export function lyricsText(res: Json): string | null {
  const shelf = res?.contents?.sectionListRenderer?.contents?.[0]?.musicDescriptionShelfRenderer;
  const text = textOf(shelf?.description).replace(/\r\n/g, "\n").trim();
  return text || null;
}

/** Library pages (playlists, albums, artists): grids or lists of cards, in whatever wrapper. */
export function libraryCards(res: Json): Card[] {
  const cards: Card[] = [];
  for (const section of sectionsOf(res)) {
    const inner = section?.itemSectionRenderer?.contents?.[0] ?? section;
    const items: Json[] = inner?.gridRenderer?.items ?? inner?.musicShelfRenderer?.contents ?? [];
    for (const item of items) {
      const card = item?.musicTwoRowItemRenderer ? twoRowCard(item.musicTwoRowItemRenderer) : item?.musicResponsiveListItemRenderer ? rowCard(item.musicResponsiveListItemRenderer) : null;
      if (card && card.kind !== "track") cards.push(card);
    }
  }
  return cards;
}

export function accountOf(res: Json): YtAccount | null {
  const header = res?.actions?.[0]?.openPopupAction?.popup?.multiPageMenuRenderer?.header?.activeAccountHeaderRenderer;
  const name = textOf(header?.accountName);
  if (!name) return null;
  return { name, handle: textOf(header?.channelHandle) || null, image: imageOf(header?.accountPhoto) };
}
