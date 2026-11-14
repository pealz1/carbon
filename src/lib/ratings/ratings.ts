// Star ratings: 0 (not rated) to 5, kept on this PC for any song from any source.
import type { Song } from "$lib/history/song";

/** Mirrors `Rating` in yours.rs. Only rated songs (1 to 5 stars) are stored. */
export interface Rating extends Song {
  stars: number;
  /** When it was last rated, in milliseconds since 1970. */
  at: number;
}

export const MAX_STARS = 5;

export const clampStars = (stars: number): number => Math.min(MAX_STARS, Math.max(0, Math.round(stars) || 0));

/** What a key does to a rating (the control is a slider): arrows step, digits set, Delete clears. Null: not a rating key. */
export function starsForKey(key: string, current: number): number | null {
  if (key === "ArrowRight" || key === "ArrowUp") return clampStars(current + 1);
  if (key === "ArrowLeft" || key === "ArrowDown") return clampStars(current - 1);
  if (key === "Home" || key === "Delete" || key === "Backspace") return 0;
  if (key === "End") return MAX_STARS;
  return /^[0-5]$/.test(key) ? Number(key) : null;
}

/** Clicking the star a song already has takes the rating away. */
export const starsForClick = (star: number, current: number): number => (star === current ? 0 : clampStars(star));

export const starsText = (stars: number): string => (stars ? `${stars} of ${MAX_STARS} stars` : "Not rated");

export interface StarGroup {
  stars: number;
  /** Most recently rated first. */
  ratings: Rating[];
}

/** Rated songs grouped by stars, five first. */
export function byStars(ratings: Rating[]): StarGroup[] {
  const groups: StarGroup[] = [];
  for (let stars = MAX_STARS; stars >= 1; stars--) {
    const rated = ratings.filter((r) => r.stars === stars).sort((a, b) => b.at - a.at);
    if (rated.length) groups.push({ stars, ratings: rated });
  }
  return groups;
}
