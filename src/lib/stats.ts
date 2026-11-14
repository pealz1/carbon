// "Your top music": what Spotify's top lists can be folded into without more requests.
import type { TopRange } from "$lib/spotify/endpoints";
import type { Card, Track } from "$lib/spotify/types";

export const RANGES: { id: TopRange; label: string }[] = [
  { id: "short_term", label: "Last 4 weeks" },
  { id: "medium_term", label: "Last 6 months" },
  { id: "long_term", label: "All time" },
];

export const rangeOf = (value: string | null): TopRange => RANGES.find((r) => r.id === value)?.id ?? "short_term";

const songs = (count: number) => `${count} of your top songs`;

/** Albums ranked by how many of the listener's top songs come from them; ties keep the higher-ranked song's album first. */
export function topAlbums(tracks: Track[], limit = 12): Card[] {
  const albums = new Map<string, { card: Card; count: number }>();
  for (const track of tracks) {
    const album = track.album;
    if (!album?.id) continue;
    const seen = albums.get(album.id);
    if (seen) seen.count += 1;
    else
      albums.set(album.id, {
        count: 1,
        card: { kind: "album", id: album.id, uri: album.uri, title: album.name, subtitle: "", image: album.image, playUri: album.uri },
      });
  }
  return [...albums.values()]
    .filter((a) => a.count > 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((a) => ({ ...a.card, subtitle: songs(a.count) }));
}
