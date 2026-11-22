// Each source's own search answer, mapped into the one shape Search draws. Pure: adapters.ts makes
// the requests, so these rules are tested without a service.
import type { BandcampSearch } from "$lib/bandcamp/map";
import { matches } from "$lib/local/browse";
import type { Song } from "$lib/providers/catalog";
import type { Station } from "$lib/radio/api";
import type { ServerSearch } from "$lib/servers/types";
import type { SoundcloudSearch } from "$lib/soundcloud/api";
import { playableOf } from "$lib/soundcloud/shared/listed";
import type { SearchResults as SpotifySearch } from "$lib/spotify/endpoints";
import { trackCard } from "$lib/spotify/mappers";
import type { Card, Track } from "$lib/spotify/types";
import type { SearchResults as YoutubeSearch } from "$lib/youtube/mappers";

export interface CardShelf {
  title: string;
  cards: Card[];
}

export interface Results {
  /** The one best answer, shown large beside the songs when a source is looked at on its own. */
  top: Card | null;
  /** Songs Carbon plays itself. */
  tracks: Track[];
  /** Catalogue hits: shown with their art, played through a match or the source's own player. */
  hits: Song[];
  /** Albums, artists and playlists, each a card that opens its page. */
  shelves: CardShelf[];
  stations: Station[];
}

export const NOTHING: Results = { top: null, tracks: [], hits: [], shelves: [], stations: [] };

const LOCAL_SONGS = 50;
const STATIONS = 24;
/** "All" shows this much of each source. */
const BRIEF = { rows: 4, cards: 8 };

const shelves = (...all: [title: string, cards: Card[]][]): CardShelf[] =>
  all.filter(([, cards]) => cards.length).map(([title, cards]) => ({ title, cards }));

export const fromSpotify = (r: SpotifySearch): Results => ({
  ...NOTHING,
  top: r.artists[0] ?? (r.tracks[0] ? trackCard(r.tracks[0]) : null),
  tracks: r.tracks,
  shelves: shelves(["Artists", r.artists], ["Albums", r.albums], ["Playlists", r.playlists]),
});

export const fromYoutube = (r: Pick<YoutubeSearch, "top" | "songs" | "albums" | "artists" | "playlists">): Results => ({
  ...NOTHING,
  top: r.top,
  tracks: r.songs,
  shelves: shelves(["Albums", r.albums], ["Artists", r.artists], ["Playlists", r.playlists]),
});

export const fromBandcamp = (r: BandcampSearch): Results => ({
  ...NOTHING,
  tracks: r.tracks,
  shelves: shelves(["Albums", r.albums], ["Artists", r.artists]),
});

/** Songs SoundCloud only previews or blocks are left out: Search lists what plays. */
export const fromSoundcloud = (r: SoundcloudSearch): Results => ({
  ...NOTHING,
  tracks: playableOf(r.tracks),
  shelves: shelves(["Playlists", r.playlists], ["Artists", r.users]),
});

export const fromServer = (r: ServerSearch): Results => ({
  ...NOTHING,
  tracks: r.tracks,
  shelves: shelves(["Albums", r.albums], ["Artists", r.artists]),
});

export const fromLocal = (library: Track[], query: string): Results => ({
  ...NOTHING,
  tracks: library.filter((track) => matches(track, query)).slice(0, LOCAL_SONGS),
});

/** A hit needs a name to show and an address to act on. */
export const fromCatalog = (songs: Song[]): Results => ({
  ...NOTHING,
  hits: songs.filter((song) => song.title.trim() && song.url?.startsWith("https://")),
});

export const fromStations = (stations: Station[]): Results => ({ ...NOTHING, stations: stations.slice(0, STATIONS) });

export const isEmpty = (r: Results): boolean => !r.top && !r.tracks.length && !r.hits.length && !r.stations.length && !r.shelves.length;

/** Where one source's search stands. */
export type Progress = "loading" | "failed" | "empty" | "found";

export const progressOf = (search: { loading: boolean; error: string | null; data: Results | null }): Progress =>
  search.error ? "failed" : search.loading ? "loading" : search.data && !isEmpty(search.data) ? "found" : "empty";

/** The best few of one source, for the page that shows them all. */
export const briefOf = (r: Results): Results => ({
  top: null,
  tracks: r.tracks.slice(0, BRIEF.rows),
  hits: r.hits.slice(0, BRIEF.rows),
  stations: r.stations.slice(0, BRIEF.rows),
  shelves: r.shelves.slice(0, 1).map((shelf) => ({ ...shelf, cards: shelf.cards.slice(0, BRIEF.cards) })),
});
