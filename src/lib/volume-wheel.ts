// Scrolling over a volume control: one notch moves it by Settings → Playback → Volume scroll step.
import { player } from "$lib/player.svelte";
import { prefs } from "$lib/preferences.svelte";

const DEFAULT_STEP = 0.05;

/** The volume after one notch, clamped and kept to whole percent. */
export function stepVolume(volume: number, deltaY: number, step: number): number {
  const next = volume + (deltaY < 0 ? step : -step);
  return Math.round(Math.min(1, Math.max(0, next)) * 100) / 100;
}

export function wheelVolume(event: WheelEvent): void {
  if (!event.deltaY) return;
  event.preventDefault();
  player.setVolume(stepVolume(player.volume, event.deltaY, prefs.value?.volumeStep ?? DEFAULT_STEP));
}
