/** What a count-up to `to` shows `elapsed` ms into a run of `duration` ms: whole, easing out, and `to` itself once the run is over. */
export function countUp(to: number, elapsed: number, duration: number): number {
  if (duration <= 0 || elapsed >= duration) return to;
  const progress = Math.max(0, elapsed) / duration;
  return Math.round(to * (1 - (1 - progress) ** 3));
}
