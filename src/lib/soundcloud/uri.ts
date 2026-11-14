// SoundCloud songs, playlists (an album is a playlist there) and people carry "soundcloud:" URIs,
// so the rest of Carbon routes them to the stream queue and to their own pages. Ids are numbers.
export type SoundcloudItem = "track" | "playlist" | "user";

export const SOUNDCLOUD_PREFIX = "soundcloud:";

export const isSoundcloudUri = (uri: string | null | undefined): boolean => Boolean(uri?.startsWith(SOUNDCLOUD_PREFIX));
export const soundcloudUri = (item: SoundcloudItem, id: string): string => `${SOUNDCLOUD_PREFIX}${item}:${id}`;

export function parseSoundcloudUri(uri: string): { item: SoundcloudItem; id: string } | null {
  const match = /^soundcloud:(track|playlist|user):(\d{1,20})$/.exec(uri);
  return match ? { item: match[1] as SoundcloudItem, id: match[2] } : null;
}

/** Carbon's page for a SoundCloud playlist, album or person. */
export function soundcloudHref(uri: string): string | null {
  const parsed = parseSoundcloudUri(uri);
  return parsed && parsed.item !== "track" ? `/soundcloud/${parsed.item}/${parsed.id}` : null;
}
