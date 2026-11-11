// YouTube Music items carry "ytm:" URIs so every part of Carbon can tell them from Spotify's
// (the two services never share a queue, a playlist or a list; see sources.ts).
export const YTM_PREFIX = "ytm:";
export type YtmKind = "video" | "album" | "playlist" | "artist";
export type PageKind = "album" | "artist" | "playlist";

export const ytmUri = (kind: YtmKind, id: string): string => `${YTM_PREFIX}${kind}:${id}`;
export const isYoutubeUri = (uri: string | null | undefined): boolean => Boolean(uri?.startsWith(YTM_PREFIX));

export function parseYtmUri(uri: string): { kind: YtmKind; id: string } | null {
  const match = /^ytm:(video|album|playlist|artist):([\w-]+)$/.exec(uri);
  return match ? { kind: match[1] as YtmKind, id: match[2] } : null;
}

/** Carbon's page for an album, artist or playlist, from either service. */
export const pageHref = (kind: PageKind, ref: { id: string; uri: string }): string =>
  isYoutubeUri(ref.uri) ? `/youtube/${kind}/${encodeURIComponent(ref.id)}` : `/${kind}/${ref.id}`;

/** The music.youtube.com address of a song, album, playlist or artist. */
export function ytmLink(uri: string): string | null {
  const parsed = parseYtmUri(uri);
  if (!parsed) return null;
  const id = encodeURIComponent(parsed.id);
  switch (parsed.kind) {
    case "video":
      return `https://music.youtube.com/watch?v=${id}`;
    case "playlist":
      return `https://music.youtube.com/playlist?list=${id}`;
    case "album":
    case "artist":
      return `https://music.youtube.com/browse/${id}`;
  }
}
