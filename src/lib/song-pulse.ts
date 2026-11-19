// How hard the wallpaper moves with the music. Spotify and YouTube give no audio to read, so the
// pace comes from the song's tempo and energy (when known) and the volume; Carbon's own engine
// (local files) adds the real bass level on top.
export interface PulseInput {
  /** Beats per minute, or null when unknown. */
  tempo: number | null;
  /** 0 to 1, or null when unknown. */
  energy: number | null;
  /** The output volume, 0 to 1. */
  volume: number;
  playing: boolean;
}

const NEUTRAL_TEMPO = 110;
const NEUTRAL_ENERGY = 0.5;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Playback rate for the drifting colour fields: about 1 at a mid-tempo song, up to ~2.4 for fast, loud ones. */
export function pace({ tempo, energy, volume, playing }: PulseInput): number {
  if (!playing) return 0.2;
  // Half- and double-time readings are common; fold them into 70–160 BPM before using them.
  let bpm = tempo && Number.isFinite(tempo) && tempo > 0 ? tempo : NEUTRAL_TEMPO;
  while (bpm > 160) bpm /= 2;
  while (bpm < 70) bpm *= 2;
  const e = energy ?? NEUTRAL_ENERGY;
  return clamp((bpm / NEUTRAL_TEMPO) * (0.6 + 0.8 * e) * (0.55 + 0.45 * clamp(volume, 0, 1)), 0.35, 2.4);
}

/** Seconds per breath: one swell every bar (four beats), so a guessed phase never fights the beat. */
export const breathSeconds = (tempo: number | null): number => {
  const bpm = tempo && tempo > 0 ? clamp(tempo, 60, 200) : NEUTRAL_TEMPO;
  return (60 / bpm) * 4;
};

/** The engine's spectrum (0–1 per band, lowest first) as one bass level, 0 to 1. */
export function bassLevel(bands: readonly number[]): number {
  const low = bands.slice(0, 4);
  return low.length ? clamp(low.reduce((s, b) => s + b, 0) / low.length, 0, 1) : 0;
}

/** Fast attack, slow release, so a kick lands at once and fades out rather than flickering. */
export const smooth = (prev: number, next: number): number => (next > prev ? prev + (next - prev) * 0.6 : prev + (next - prev) * 0.12);
