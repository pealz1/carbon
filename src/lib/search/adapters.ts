// One search per source, each answering in Search's common shape (map.ts). An answer is kept for
// a short while, so going between "All" and one source doesn't ask a service twice.
import * as bandcamp from "$lib/bandcamp/api";
import { localLibrary } from "$lib/local/library.svelte";
import { searchCatalog, type Provider, type Song } from "$lib/providers/catalog";
import { stations } from "$lib/radio/api";
import { currentRegion } from "$lib/region";
import { libraryOf } from "$lib/servers/library";
import type { ServerKind } from "$lib/servers/uri";
import * as soundcloud from "$lib/soundcloud/api";
import { brief } from "$lib/soundcloud/shared/listed";
import * as spotify from "$lib/spotify/endpoints";
import * as youtubeMusic from "$lib/youtube/api";
import { rememberLikes } from "$lib/youtube/session.svelte";
import * as map from "./map";
import { matchSong, type Match } from "./match";
import type { SourceId } from "./sources";

type Search = (term: string) => Promise<map.Results>;

const DEFAULT_STOREFRONT = "us";
/** Apple's catalogue differs by country; the listener's region picks the storefront. */
const storefront = (): string => {
  const region = currentRegion().toLowerCase();
  return /^[a-z]{2}$/.test(region) ? region : DEFAULT_STOREFRONT;
};

const catalogue = (provider: Provider): Search => async (term) => map.fromCatalog(await searchCatalog(provider, term, storefront()));
const server = (kind: ServerKind): Search => async (term) => map.fromServer(await libraryOf(kind).search(term));

async function youtube(term: string): Promise<map.Results> {
  // The all-results answer lists songs without length or album, so the songs come from the songs tab.
  const [all, songs] = await Promise.all([youtubeMusic.search(term), youtubeMusic.search(term, "songs")]);
  const found = map.fromYoutube({ ...all, songs: songs.songs.length ? songs.songs : all.songs });
  rememberLikes(found.tracks);
  return found;
}

async function local(term: string): Promise<map.Results> {
  await localLibrary.load();
  return map.fromLocal(localLibrary.tracks, term);
}

const ADAPTERS: Record<SourceId, Search> = {
  spotify: brief(async (term) => map.fromSpotify(await spotify.search(term))),
  youtube: brief(youtube),
  // Not remembered: the library changes under it, and reading it costs nothing.
  local,
  subsonic: brief(server("subsonic")),
  jellyfin: brief(server("jellyfin")),
  plex: brief(server("plex")),
  bandcamp: brief(async (term) => map.fromBandcamp(await bandcamp.search(term))),
  soundcloud: brief(async (term) => map.fromSoundcloud(await soundcloud.search(term))),
  radio: brief(async (term) => map.fromStations(await stations(term))),
  deezer: brief(catalogue("deezer")),
  apple: brief(catalogue("apple")),
  mixcloud: brief(catalogue("mixcloud")),
  archive: brief(catalogue("archive")),
};

/** What one source has for `term`. Rejects (with a sentence, or an error describeError can read) when the source can't answer. */
export const searchSource = (id: SourceId, term: string): Promise<map.Results> => ADAPTERS[id](term);

/** A catalogue hit's closest songs on a source Carbon can play; `selected` is set only when one is clearly the same recording. */
export const matchOn = (id: SourceId, song: Song): Promise<Match> =>
  matchSong(song, async (term) => (await searchSource(id, term)).tracks);
