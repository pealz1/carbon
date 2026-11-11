// Pulls a few vivid colours out of artwork for the wallpaper, header washes and Play pills.
export type Rgb = [number, number, number];

const SAMPLE_SIZE = 32;
const BUCKET = 24; // quantisation step per channel

function saturation([r, g, b]: Rgb): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

const luminance = ([r, g, b]: Rgb): number => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/** Picks `count` dominant colours, preferring saturated mid-tones over greys and near-black/white. */
export function dominantColors(pixels: Uint8ClampedArray, count = 3): Rgb[] {
  const buckets = new Map<string, { sum: Rgb; n: number }>();
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const rgb: Rgb = [pixels[i], pixels[i + 1], pixels[i + 2]];
    const key = rgb.map((c) => Math.floor(c / BUCKET)).join(",");
    const entry = buckets.get(key) ?? { sum: [0, 0, 0], n: 0 };
    entry.sum = [entry.sum[0] + rgb[0], entry.sum[1] + rgb[1], entry.sum[2] + rgb[2]];
    entry.n++;
    buckets.set(key, entry);
  }
  const scored = [...buckets.values()]
    .map(({ sum, n }) => {
      const rgb: Rgb = [sum[0] / n, sum[1] / n, sum[2] / n].map(Math.round) as Rgb;
      const lum = luminance(rgb);
      const vivid = 0.35 + saturation(rgb);
      const midtone = lum < 0.08 || lum > 0.92 ? 0.15 : 1;
      return { rgb, score: n * vivid * midtone };
    })
    .sort((a, b) => b.score - a.score);
  const picked: Rgb[] = [];
  for (const { rgb } of scored) {
    if (picked.every((p) => Math.hypot(p[0] - rgb[0], p[1] - rgb[1], p[2] - rgb[2]) > 60)) picked.push(rgb);
    if (picked.length === count) break;
  }
  return picked;
}

/** Loads artwork through a tiny canvas. Needs the image host to allow CORS (Spotify's does). */
export async function paletteFrom(url: string, count = 3): Promise<Rgb[]> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.decoding = "async";
  img.src = url;
  await img.decode();
  const canvas = new OffscreenCanvas(SAMPLE_SIZE, SAMPLE_SIZE);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  return dominantColors(ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data, count);
}

const CACHE_LIMIT = 120;
const cache = new Map<string, Promise<Rgb[]>>();

/** `paletteFrom`, read once per URL (the wallpaper, a header wash and its Play pill share one decode).
 *  Never rejects: artwork that can't be read (offline, a tainted canvas) gives [] and Carbon falls back to graphite. */
export function cachedPalette(url: string): Promise<Rgb[]> {
  const hit = cache.get(url);
  if (hit) return hit;
  const found = paletteFrom(url, 4).catch((e) => {
    console.warn("[palette] artwork colours unavailable", e);
    cache.delete(url); // try again next time
    return [] as Rgb[];
  });
  cache.set(url, found);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return found;
}
