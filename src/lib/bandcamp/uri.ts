// Bandcamp songs, releases and artists carry "bandcamp:" URIs built from Bandcamp's own numeric
// ids, never a page address, so nothing the webview holds can point Carbon at another site:
//   bandcamp:track:<band>:<song>     a song (plays in the stream queue)
//   bandcamp:album:<band>:a<album>   an album;  bandcamp:album:<band>:t<song>  a song released on its own
//   bandcamp:artist:<band>           an artist or label
export type ReleaseKind = "a" | "t";

export const BANDCAMP_PREFIX = "bandcamp:";

export type BandcampRef =
  | { item: "track"; band: string; id: string }
  | { item: "album"; band: string; kind: ReleaseKind; id: string }
  | { item: "artist"; band: string };

export const isBandcampUri = (uri: string | null | undefined): boolean => Boolean(uri?.startsWith(BANDCAMP_PREFIX));
export const trackUri = (band: string, id: string): string => `${BANDCAMP_PREFIX}track:${band}:${id}`;
export const releaseUri = (band: string, kind: ReleaseKind, id: string): string => `${BANDCAMP_PREFIX}album:${band}:${kind}${id}`;
export const artistUri = (band: string): string => `${BANDCAMP_PREFIX}artist:${band}`;

/** The "a123" / "t123" part of a release's URI and page address. */
export function parseRelease(text: string): { kind: ReleaseKind; id: string } | null {
  const match = /^([at])(\d{1,20})$/.exec(text);
  return match ? { kind: match[1] as ReleaseKind, id: match[2] } : null;
}

export function parseBandcampUri(uri: string): BandcampRef | null {
  const match = /^bandcamp:(track|album|artist):(\d{1,20})(?::([at]?\d{1,20}))?$/.exec(uri);
  if (!match) return null;
  const [, item, band, rest] = match;
  if (item === "artist") return rest === undefined ? { item, band } : null;
  if (item === "track") return rest && /^\d+$/.test(rest) ? { item, band, id: rest } : null;
  const release = parseRelease(rest ?? "");
  return release ? { item: "album", band, ...release } : null;
}

/** Carbon's page for a Bandcamp release or artist. */
export function bandcampHref(uri: string): string | null {
  const parsed = parseBandcampUri(uri);
  if (parsed?.item === "album") return `/bandcamp/album/${parsed.band}/${parsed.kind}${parsed.id}`;
  return parsed?.item === "artist" ? `/bandcamp/artist/${parsed.band}` : null;
}
