// SponsorBlock (sponsor.ajay.app): a community database of the parts of a video that aren't the
// thing itself. Carbon asks only for "music_offtopic", the non-music stretches of music videos
// (spoken intros, skits, credits), and skips them. Lookups use the API's privacy mode: only the
// first characters of the video id's hash are sent, and the match is picked out here.
const API = "https://sponsor.ajay.app/api/skipSegments";
const CATEGORY = "music_offtopic";
const HASH_PREFIX = 4;
const MAX_CACHED = 200;
const MAX_SEGMENTS = 20;
/** Landing this close to a segment's end isn't worth a seek. */
const NEAR_END_MS = 500;

/** [start, end] in ms. */
export type Segment = [number, number];

const cache = new Map<string, Promise<Segment[]>>();

async function hashPrefix(videoId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(videoId));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, HASH_PREFIX);
}

/** The skip segments for `videoId` out of the API's answer for its hash prefix; anything malformed is left out. */
export function segmentsIn(answer: unknown, videoId: string): Segment[] {
  if (!Array.isArray(answer)) return [];
  const video = answer.find((v) => v && typeof v === "object" && v.videoID === videoId);
  const raw: unknown[] = Array.isArray(video?.segments) ? video.segments : [];
  return raw
    .filter((s): s is { segment: [number, number]; category: string; actionType?: string } => {
      const seg = (s as { segment?: unknown })?.segment;
      return Array.isArray(seg) && seg.length === 2 && seg.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0) && seg[1] > seg[0];
    })
    .filter((s) => s.category === CATEGORY && (s.actionType ?? "skip") === "skip")
    .map((s): Segment => [Math.round(s.segment[0] * 1000), Math.round(s.segment[1] * 1000)])
    .sort((a, b) => a[0] - b[0])
    .slice(0, MAX_SEGMENTS);
}

async function lookup(videoId: string): Promise<Segment[]> {
  const res = await fetch(`${API}/${await hashPrefix(videoId)}?category=${CATEGORY}`);
  if (res.status === 404) return []; // nothing submitted under this prefix
  if (!res.ok) throw new Error(`SponsorBlock answered ${res.status}`);
  return segmentsIn(await res.json(), videoId);
}

/** The non-music segments of a video, looked up once. Never rejects: no answer means nothing is skipped. */
export function segmentsFor(videoId: string): Promise<Segment[]> {
  const hit = cache.get(videoId);
  if (hit) return hit;
  const found = lookup(videoId).catch((e) => {
    console.warn("[sponsorblock] lookup failed", e);
    cache.delete(videoId); // ask again next time
    return [] as Segment[];
  });
  cache.set(videoId, found);
  if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!);
  return found;
}

/** Where to jump to when `positionMs` is inside a segment, or null to keep playing. */
export function skipTarget(segments: Segment[], positionMs: number): number | null {
  const inside = segments.find(([start, end]) => positionMs >= start && positionMs < end - NEAR_END_MS);
  return inside ? inside[1] : null;
}
