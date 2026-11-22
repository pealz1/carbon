// The year as a few lines of plain text, for the clipboard.
import type { Top, Wrapped } from "$lib/history/wrapped";
import { PERSONAS } from "./personas";

const named = (top: Top): string => [top.title, top.subtitle].filter(Boolean).join(" · ");

/** `t` translates the labels; names, titles and numbers go in as they are. */
export function summaryText(year: Wrapped, t: (label: string) => string): string {
  const [song] = year.songs;
  const [artist] = year.artists;
  const [album] = year.albums;
  const line = (label: string, value: string) => `${t(label)}: ${value}`;
  const lines = [
    `${t("Your year in Carbon")} · ${year.year}`,
    line("Minutes listened", year.minutes.toLocaleString()),
    line("Plays", year.plays.toLocaleString()),
    song && line("Top song", named(song)),
    artist && line("Top artist", artist.title),
    album && line("Top album", named(album)),
    line("Longest streak", year.streakDays === 1 ? t("1 day") : `${year.streakDays.toLocaleString()} ${t("days")}`),
    line("Listening style", t(PERSONAS[year.persona].name)),
  ];
  return lines.filter((text): text is string => !!text).join("\n");
}
