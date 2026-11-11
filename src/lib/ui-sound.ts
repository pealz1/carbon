// Carbon's interface sounds: tiny WebAudio recipes, no audio files. They never play over Spotify's
// audio (Spotify Developer Policy III.7); they may play while paused, idle or on a local file.
import { isLocalUri } from "$lib/local/tracks";

export type UiSound = "tap" | "select" | "toggle-on" | "toggle-off" | "hold" | "error" | "whoosh";

export interface SoundGate {
  enabled: boolean;
  /** 0 to 1, from Settings. */
  volume: number;
  paused: boolean;
  /** The current track, if any. */
  trackUri: string | null;
}

/** Spotify audio is playing whenever a non-local track isn't paused; then Carbon stays silent. */
export function soundAllowed({ enabled, volume, paused, trackUri }: SoundGate): boolean {
  return enabled && volume > 0 && (paused || !trackUri || isLocalUri(trackUri));
}

/** Peak level at full volume: −18 dBFS. The default volume (0.5) peaks near −24 dBFS. */
const PEAK_AT_FULL = 10 ** (-18 / 20);
export const peakGain = (volume: number): number => Math.min(1, Math.max(0, volume)) * PEAK_AT_FULL;

export interface Tone {
  type: OscillatorType;
  /** Hz at the start and end of the tone (a glide when they differ). */
  from: number;
  to: number;
  /** Seconds after the sound starts. */
  at: number;
  dur: number;
  /** Share of the peak, 0 to 1. */
  level: number;
}

export interface Noise {
  /** Band-pass centre sweep, Hz. */
  from: number;
  to: number;
  at: number;
  dur: number;
  level: number;
}

export interface Recipe {
  tones: Tone[];
  noise?: Noise;
}

const ATTACK = 0.004;

export const RECIPES: Record<UiSound, Recipe> = {
  tap: { tones: [{ type: "triangle", from: 1500, to: 1050, at: 0, dur: 0.05, level: 0.55 }] },
  select: { tones: [{ type: "sine", from: 1320, to: 1320, at: 0, dur: 0.07, level: 0.5 }] },
  "toggle-on": {
    tones: [
      { type: "sine", from: 740, to: 740, at: 0, dur: 0.07, level: 0.5 },
      { type: "sine", from: 1110, to: 1110, at: 0.07, dur: 0.1, level: 0.5 },
    ],
  },
  "toggle-off": {
    tones: [
      { type: "sine", from: 1110, to: 1110, at: 0, dur: 0.07, level: 0.5 },
      { type: "sine", from: 740, to: 740, at: 0.07, dur: 0.1, level: 0.45 },
    ],
  },
  hold: {
    tones: [
      { type: "sine", from: 520, to: 780, at: 0, dur: 0.18, level: 0.7 },
      { type: "triangle", from: 1560, to: 1560, at: 0.09, dur: 0.2, level: 0.25 },
    ],
  },
  error: {
    tones: [
      { type: "triangle", from: 392, to: 392, at: 0, dur: 0.11, level: 0.75 },
      { type: "triangle", from: 294, to: 294, at: 0.11, dur: 0.18, level: 0.75 },
    ],
  },
  whoosh: { tones: [], noise: { from: 500, to: 2600, at: 0, dur: 0.24, level: 0.45 } },
};

/** Envelope level (share of peak) of one part at time t: a 4 ms rise, then an exponential fall to silence. */
export function envelope(t: number, part: { at: number; dur: number; level: number }): number {
  const local = t - part.at;
  if (local < 0 || local > part.dur) return 0;
  if (local < ATTACK) return (part.level * local) / ATTACK;
  return part.level * 0.001 ** ((local - ATTACK) / (part.dur - ATTACK));
}

/** Plays a recipe now. One gain node per part, so overlapping parts never stack past the peak. */
export function schedule(ctx: AudioContext, recipe: Recipe, peak: number): void {
  const start = ctx.currentTime + 0.005;
  const out = ctx.createGain();
  out.gain.value = peak;
  out.connect(ctx.destination);
  for (const tone of recipe.tones) {
    const osc = ctx.createOscillator();
    osc.type = tone.type;
    osc.frequency.setValueAtTime(tone.from, start + tone.at);
    if (tone.to !== tone.from) osc.frequency.exponentialRampToValueAtTime(tone.to, start + tone.at + tone.dur);
    osc.connect(shaped(ctx, out, tone, start));
    osc.start(start + tone.at);
    osc.stop(start + tone.at + tone.dur + 0.02);
  }
  if (recipe.noise) playNoise(ctx, out, recipe.noise, start);
}

function shaped(ctx: AudioContext, out: AudioNode, part: { at: number; dur: number; level: number }, start: number): GainNode {
  const gain = ctx.createGain();
  const t0 = start + part.at;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(part.level, t0 + ATTACK);
  gain.gain.exponentialRampToValueAtTime(part.level * 0.001, t0 + part.dur);
  gain.connect(out);
  return gain;
}

function playNoise(ctx: AudioContext, out: AudioNode, noise: Noise, start: number): void {
  const length = Math.ceil(ctx.sampleRate * (noise.dur + 0.05));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 0.9;
  band.frequency.setValueAtTime(noise.from, start + noise.at);
  band.frequency.exponentialRampToValueAtTime(noise.to, start + noise.at + noise.dur);
  source.connect(band);
  band.connect(shaped(ctx, out, noise, start));
  source.start(start + noise.at);
  source.stop(start + noise.at + noise.dur + 0.02);
}
