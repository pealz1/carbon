// Songs, albums, artists and playlists on the listener's own server carry "server:" URIs, so the
// rest of Carbon can tell them from Spotify's and YouTube Music's and route them to the right
// player and pages. Ids are the server's own and may hold anything, so they are percent-encoded.
export type ServerKind = "subsonic" | "jellyfin" | "plex";
export type ServerItem = "track" | "album" | "artist" | "playlist";

export const SERVER_PREFIX = "server:";
export const SERVER_NAMES: Record<ServerKind, string> = { subsonic: "Navidrome", jellyfin: "Jellyfin", plex: "Plex" };
const KINDS: readonly string[] = ["subsonic", "jellyfin", "plex"];

export const isServerUri = (uri: string | null | undefined): boolean => Boolean(uri?.startsWith(SERVER_PREFIX));
export const isServerKind = (value: string | null | undefined): value is ServerKind => KINDS.includes(value ?? "");

export const serverUri = (kind: ServerKind, item: ServerItem, id: string): string => `${SERVER_PREFIX}${kind}:${item}:${encodeURIComponent(id)}`;

export function parseServerUri(uri: string): { kind: ServerKind; item: ServerItem; id: string } | null {
  const match = /^server:(subsonic|jellyfin|plex):(track|album|artist|playlist):(.+)$/.exec(uri);
  if (!match) return null;
  try {
    return { kind: match[1] as ServerKind, item: match[2] as ServerItem, id: decodeURIComponent(match[3]) };
  } catch {
    return null; // a mangled escape
  }
}

/** Query parameters that sign a server address: with them, the address is as good as the sign-in itself. */
const SIGNING = ["t", "s", "X-Plex-Token", "ApiKey", "api_key"];

/**
 * `url` when it is safe to hand on (to Discord, the phone remote, a file on disk), or null when it
 * carries a server sign-in. Navidrome and Plex artwork is loaded with the session in the address, so
 * it is shown in Carbon's own windows and goes nowhere else.
 */
export function shareable(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const params = new URL(url).searchParams;
    return SIGNING.some((name) => params.has(name)) ? null : url;
  } catch {
    return null;
  }
}

/** Carbon's page for a server album, artist or playlist. */
export function serverHref(uri: string): string | null {
  const parsed = parseServerUri(uri);
  return parsed && parsed.item !== "track" ? `/server/${parsed.kind}/${parsed.item}/${encodeURIComponent(parsed.id)}` : null;
}
