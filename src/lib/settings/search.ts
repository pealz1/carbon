// Settings search: which rows a query finds. Pure, so it can be tested without the page.

export interface SearchRow {
  label: string;
  /** The heading of the group the row sits in. */
  group: string;
  /** Synonyms the label doesn't carry ("dark mode oled", "eq equalizer bass"). */
  keywords?: string;
}

/** Lower case and without accents, so "Thème" is found by "theme". */
export const fold = (text: string): string => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** The rows whose label, group heading and keywords together hold every word of the query, in the order given. */
export function matchSettings<T extends SearchRow>(rows: readonly T[], query: string): T[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return rows.filter((row) => {
    const text = fold(`${row.label} ${row.group} ${row.keywords ?? ""}`);
    return words.every((word) => text.includes(word));
  });
}
