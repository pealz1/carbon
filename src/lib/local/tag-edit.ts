// The tag editor's form: text in, a checked TagEdit out. Rust checks the same limits again
// (local_library/tags.rs) before anything is written to a file.
import type { TagEdit } from "./api";

export const TAG_LIMITS = { text: 300, artists: 20, trackNo: 9999, discNo: 999, year: 9999 } as const;
/** Artists are typed on one line; a file stores each as its own value. Names often hold commas, so it's a semicolon. */
const ARTIST_SEPARATOR = ";";
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

export type TagForm = Record<keyof TagEdit, string>;
export type TagProblems = Partial<Record<keyof TagEdit, string>>;

export const splitArtists = (text: string): string[] =>
  text
    .split(ARTIST_SEPARATOR)
    .map((a) => a.trim())
    .filter(Boolean);

export const joinArtists = (artists: string[]): string => artists.join(`${ARTIST_SEPARATOR} `);

const shown = (n: number | null): string => (n === null ? "" : String(n));

export const toForm = (t: TagEdit): TagForm => ({
  title: t.title,
  artists: joinArtists(t.artists),
  album: t.album,
  albumArtist: t.albumArtist,
  trackNo: shown(t.trackNo),
  discNo: shown(t.discNo),
  year: shown(t.year),
  genre: t.genre,
});

function textProblem(value: string): string | null {
  const text = value.trim();
  if (CONTROL.test(text)) return "This can't contain line breaks.";
  if ([...text].length > TAG_LIMITS.text) return `Keep it under ${TAG_LIMITS.text} characters.`;
  return null;
}

function artistsProblem(value: string): string | null {
  const artists = splitArtists(value);
  if (artists.length > TAG_LIMITS.artists) return `A song can have up to ${TAG_LIMITS.artists} artists.`;
  return artists.map(textProblem).find(Boolean) ?? null;
}

const toNumber = (value: string): number | null => (value.trim() ? Number(value.trim()) : null);

function numberProblem(value: string, max: number): string | null {
  const text = value.trim();
  if (!text) return null;
  const ok = /^\d+$/.test(text) && Number(text) >= 1 && Number(text) <= max;
  return ok ? null : `Use a whole number from 1 to ${max}, or leave it empty.`;
}

/** What's wrong with each field; empty when the form can be saved. */
export function problemsOf(form: TagForm): TagProblems {
  const found: Record<keyof TagEdit, string | null> = {
    title: textProblem(form.title),
    artists: artistsProblem(form.artists),
    album: textProblem(form.album),
    albumArtist: textProblem(form.albumArtist),
    trackNo: numberProblem(form.trackNo, TAG_LIMITS.trackNo),
    discNo: numberProblem(form.discNo, TAG_LIMITS.discNo),
    year: numberProblem(form.year, TAG_LIMITS.year),
    genre: textProblem(form.genre),
  };
  return Object.fromEntries(Object.entries(found).filter(([, problem]) => problem)) as TagProblems;
}

/** Only for a form `problemsOf` found nothing wrong with. */
export const toEdit = (form: TagForm): TagEdit => ({
  title: form.title.trim(),
  artists: splitArtists(form.artists),
  album: form.album.trim(),
  albumArtist: form.albumArtist.trim(),
  trackNo: toNumber(form.trackNo),
  discNo: toNumber(form.discNo),
  year: toNumber(form.year),
  genre: form.genre.trim(),
});
