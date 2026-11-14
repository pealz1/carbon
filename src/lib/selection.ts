// Selecting several songs in a list: which rows a click selects, what Ctrl+C puts on the clipboard,
// and which songs a pasted block of links names. Pure, so a list component only wires events to it.
import { parseLink } from "$lib/links";
import type { Track } from "$lib/spotify/types";
import { ytmLink } from "$lib/youtube/uri";

export interface Selection {
  /** Row indexes, in no particular order. */
  rows: ReadonlySet<number>;
  /** Where a Shift-click range starts. */
  anchor: number | null;
}

export const NONE: Selection = { rows: new Set(), anchor: null };

const range = (from: number, to: number): number[] => Array.from({ length: Math.abs(to - from) + 1 }, (_, k) => Math.min(from, to) + k);

/** The selection after clicking row `index`: plain picks it alone, Ctrl toggles it, Shift extends from the anchor. */
export function clicked(selection: Selection, index: number, keys: { ctrl: boolean; shift: boolean }): Selection {
  if (keys.shift && selection.anchor !== null) {
    const span = range(selection.anchor, index);
    return { rows: new Set(keys.ctrl ? [...selection.rows, ...span] : span), anchor: selection.anchor };
  }
  if (keys.ctrl) {
    const rows = new Set(selection.rows);
    if (!rows.delete(index)) rows.add(index);
    return { rows, anchor: index };
  }
  return { rows: new Set([index]), anchor: index };
}

export const all = (count: number): Selection => ({ rows: new Set(range(0, Math.max(0, count - 1)).slice(0, count)), anchor: count ? 0 : null });

/** The selected songs in list order. */
export const picked = (tracks: Track[], selection: Selection): Track[] => tracks.filter((_, i) => selection.rows.has(i));

function spotifyLink(uri: string): string | null {
  const match = /^spotify:(track|episode):([A-Za-z0-9]+)$/.exec(uri);
  return match ? `https://open.spotify.com/${match[1]}/${match[2]}` : null;
}

/** One line per song: its link where the service has one, else "Artist - Title". */
export function copyText(tracks: Track[]): string {
  const line = (t: Track) => spotifyLink(t.uri) ?? ytmLink(t.uri) ?? [t.artists.map((a) => a.name).join(", "), t.name].filter(Boolean).join(" - ");
  return tracks.map(line).join("\n");
}

/** The Spotify songs named by pasted text (links or spotify: URIs, one per line or separated by spaces), in order, once each. */
export function pastedSpotifyUris(text: string, limit = 500): string[] {
  const uris = text
    .split(/\s+/)
    .map((word) => parseLink(word))
    .filter((link) => link?.service === "spotify" && link.what === "song")
    .map((link) => link!.playUri!);
  return [...new Set(uris)].slice(0, limit);
}
