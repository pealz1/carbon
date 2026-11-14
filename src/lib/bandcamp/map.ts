// Bandcamp's answers (search, a release, an artist) mapped into the shapes Carbon's pages and
// player share. Pure: api.ts makes the requests, so these rules are tested against trimmed real answers.
import { idOf, list, text, type Listed, type Raw } from "$lib/soundcloud/shared/listed";
import type { ArtistRef, Card, Track } from "$lib/spotify/types";
import { artistUri, releaseUri, trackUri, type ReleaseKind } from "./uri";

const IMAGES = "https://f4.bcbits.com/img";
/** Bandcamp's image sizes: 2 is 350 px, 5 is 700 px. */
const CARD_SIZE = 2;
const HEADER_SIZE = 5;
const STREAM = "mp3-128";
export const NO_STREAM = "Not streamed on Bandcamp";

export interface BandcampRelease {
  uri: string;
  name: string;
  image: string | null;
  artist: ArtistRef;
  /** A song released on its own rather than an album. */
  single: boolean;
  year: string;
  tracks: Listed[];
}

export interface BandcampArtist {
  id: string;
  uri: string;
  name: string;
  image: string | null;
  location: string;
  releases: Card[];
}

export interface BandcampSearch {
  tracks: Track[];
  albums: Card[];
  artists: Card[];
}

/** Cover art by its id. */
export const artUrl = (artId: unknown, size = CARD_SIZE): string | null => (idOf(artId) ? `${IMAGES}/a${idOf(artId).padStart(10, "0")}_${size}.jpg` : null);
/** An artist's photo by its id. */
export const photoUrl = (imageId: unknown, size = CARD_SIZE): string | null => (idOf(imageId) ? `${IMAGES}/${idOf(imageId).padStart(10, "0")}_${size}.jpg` : null);

const artistRef = (bandId: unknown, name: unknown): ArtistRef => {
  const id = idOf(bandId);
  return { id, name: text(name) || "Unknown artist", uri: id ? artistUri(id) : "" };
};

const yearOf = (date: unknown): string => {
  if (typeof date === "number" && date > 0) return String(new Date(date * 1000).getUTCFullYear());
  return /\b(\d{4})\b/.exec(text(date))?.[1] ?? "";
};

/** One search result of type "t": a song, which Bandcamp lists without its length. */
function foundTrack(raw: Raw): Track {
  const band = idOf(raw.band_id);
  const albumId = idOf(raw.album_id);
  const image = artUrl(raw.art_id);
  return {
    id: idOf(raw.id),
    uri: trackUri(band, idOf(raw.id)),
    name: text(raw.name) || "Untitled",
    artists: [artistRef(band, raw.band_name)],
    album: albumId ? { id: albumId, name: text(raw.album_name), uri: releaseUri(band, "a", albumId), image } : image ? { id: "", name: "", uri: "", image } : null,
    durationMs: 0,
    explicit: false,
  };
}

function foundAlbum(raw: Raw): Card {
  const uri = releaseUri(idOf(raw.band_id), "a", idOf(raw.id));
  return { kind: "album", id: idOf(raw.id), uri, title: text(raw.name) || "Untitled", subtitle: text(raw.band_name), image: artUrl(raw.art_id), playUri: uri };
}

function foundArtist(raw: Raw): Card {
  const uri = artistUri(idOf(raw.id));
  const subtitle = [raw.is_label === true ? "Label" : "Artist", text(raw.location)].filter(Boolean).join(" · ");
  return { kind: "artist", id: idOf(raw.id), uri, title: text(raw.name) || "Unknown artist", subtitle, image: photoUrl(raw.img_id), playUri: uri };
}

/** Search results sorted into songs, albums and artists; anything without the ids Carbon needs is left out. */
export function searchResults(value: unknown): BandcampSearch {
  const results = list(value).filter((r) => idOf(r.id));
  const owned = results.filter((r) => idOf(r.band_id));
  return {
    tracks: owned.filter((r) => r.type === "t").map(foundTrack),
    albums: owned.filter((r) => r.type === "a").map(foundAlbum),
    artists: results.filter((r) => r.type === "b").map(foundArtist),
  };
}

/** A release's songs. `raw` is Bandcamp's "tralbum" answer: an album ("a") or one song ("t"). */
export function release(raw: Raw): BandcampRelease {
  const kind: ReleaseKind = raw.type === "t" ? "t" : "a";
  const band = idOf(raw.band?.band_id);
  const artist = { ...artistRef(band, raw.band?.name), name: text(raw.tralbum_artist) || text(raw.band?.name) || "Unknown artist" };
  const uri = releaseUri(band, kind, idOf(raw.id));
  // A song released on its own may still belong to an album; its row then links there.
  const albumId = kind === "a" ? idOf(raw.id) : idOf(raw.album_id);
  const albumName = kind === "a" ? text(raw.title) : text(raw.album_title);

  const song = (t: Raw): Listed => {
    const owner = idOf(t.band_id) || band;
    const image = artUrl(t.art_id) ?? artUrl(raw.art_id);
    const streams = t.is_streamable !== false && Boolean(text(t.streaming_url?.[STREAM]));
    return {
      track: {
        id: idOf(t.track_id),
        uri: trackUri(owner, idOf(t.track_id)),
        name: text(t.title) || "Untitled",
        artists: [artistRef(owner, t.band_name || artist.name)],
        album: albumId ? { id: albumId, name: albumName, uri: releaseUri(band, "a", albumId), image } : image ? { id: "", name: "", uri: "", image } : null,
        durationMs: Math.max(0, Math.round((Number(t.duration) || 0) * 1000)),
        explicit: false,
      },
      reason: streams ? null : NO_STREAM,
    };
  };

  return {
    uri,
    name: text(raw.title) || "Untitled",
    image: artUrl(raw.art_id, HEADER_SIZE),
    artist,
    single: kind === "t",
    year: yearOf(raw.release_date),
    tracks: list(raw.tracks).filter((t) => idOf(t.track_id)).map(song),
  };
}

function releaseCard(raw: Raw, fallbackBand: string): Card {
  const kind: ReleaseKind = raw.item_type === "track" ? "t" : "a";
  const uri = releaseUri(idOf(raw.band_id) || fallbackBand, kind, idOf(raw.item_id));
  const subtitle = [yearOf(raw.release_date), text(raw.artist_name) || text(raw.band_name)].filter(Boolean).join(" · ");
  return { kind: "album", id: idOf(raw.item_id), uri, title: text(raw.title) || "Untitled", subtitle, image: artUrl(raw.art_id), playUri: uri };
}

/** An artist or label with everything they have released, newest first as Bandcamp lists it. */
export function artist(raw: Raw): BandcampArtist {
  const id = idOf(raw.id);
  return {
    id,
    uri: artistUri(id),
    name: text(raw.name) || "Unknown artist",
    image: photoUrl(raw.bio_image_id, HEADER_SIZE),
    location: text(raw.location),
    releases: list(raw.discography).filter((d) => idOf(d.item_id)).map((d) => releaseCard(d, id)),
  };
}
