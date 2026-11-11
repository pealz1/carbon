// Turns artwork colours into Carbon's tones: the chrome wash, the detail-page wash and the Play
// pill. Every tone is pinned to a relative luminance, so text on it keeps its contrast whatever
// the cover looks like.
import type { Rgb } from "$lib/palette";

/** Brand Graphite 800: the colour when there's no artwork to read. */
export const GRAPHITE: Rgb = [34, 34, 30];
export const PAPER: Rgb = [239, 239, 230];
export const INK: Rgb = [16, 16, 13];

/** Relative luminance targets (WCAG). Chrome stays deep enough for Paper text at 7:1 or better. */
export const FIELD_LUMINANCE = [0.032, 0.022, 0.014, 0.026] as const;
const WASH_LUMINANCE = 0.055;
const PILL_LUMINANCE = 0.42;
const MIN_SATURATION = 0.62;
/** Below this the colour is a grey, and stays one. */
const GREY = 0.1;

const linear = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export const luminance = ([r, g, b]: Rgb): number => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

type Hsl = [number, number, number];

function toHsl([r, g, b]: Rgb): Hsl {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return [h / 6, s, l];
}

function fromHsl([h, s, l]: Hsl): Rgb {
  if (s === 0) return [l, l, l].map((v) => Math.round(v * 255)) as Rgb;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    const u = (t + 1) % 1;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)].map((v) => Math.round(v * 255)) as Rgb;
}

/** The same hue at a given relative luminance, saturation lifted to `minSaturation` unless it's a grey. */
export function atLuminance(rgb: Rgb, target: number, minSaturation = MIN_SATURATION): Rgb {
  const [h, s] = toHsl(rgb);
  const sat = s < GREY ? s : Math.max(s, minSaturation);
  let [lo, hi] = [0, 1];
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (luminance(fromHsl([h, sat, mid])) < target) lo = mid;
    else hi = mid;
  }
  return fromHsl([h, sat, lo]);
}

export interface Tones {
  /** Four colour fields for the window's wallpaper (the chrome). */
  fields: Rgb[];
  /** The radial wash behind a detail page's header. */
  wash: Rgb;
  /** The detail page's Play pill; Ink text sits on it. */
  pill: Rgb;
}

/** Maps dominant artwork colours (from `paletteFrom`) to tones. An empty palette gives graphite. */
export function tonesFrom(colors: Rgb[]): Tones {
  const source = colors.length ? colors : [GRAPHITE];
  const pick = (i: number) => source[i % source.length];
  return {
    fields: FIELD_LUMINANCE.map((lum, i) => atLuminance(pick(i), lum)),
    wash: atLuminance(source[0], WASH_LUMINANCE, 0.5),
    pill: atLuminance(source[0], PILL_LUMINANCE, 0.5),
  };
}

/** The brightest colour overlapping fields can composite to: the per-channel maximum. */
export const ceiling = (fields: Rgb[]): Rgb => [0, 1, 2].map((c) => Math.max(0, ...fields.map((f) => f[c]))) as Rgb;

export const css = ([r, g, b]: Rgb, alpha = 1): string => (alpha === 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${alpha})`);
