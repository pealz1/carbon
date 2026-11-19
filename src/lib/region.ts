// Settings → General → Region: the listener's country for local radio. Carbon never asks the OS
// for a location; empty means the region the system's language settings name.
import { prefs } from "$lib/preferences.svelte";

/** Two-letter region from a language tag ("en-GB" → "GB"), or "" when it names none. */
export function regionOf(language: string): string {
  try {
    return new Intl.Locale(language).maximize().region ?? "";
  } catch {
    return "";
  }
}

export const systemRegion = (): string => regionOf(navigator.language);

export const currentRegion = (): string => prefs.value?.region || systemRegion();

/** "GB" → "United Kingdom", in the listener's language; the code itself if the name is unknown. */
export function regionName(code: string, language = navigator.language): string {
  try {
    return new Intl.DisplayNames([language], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Every two-letter region the runtime can name, sorted by name, for the picker. */
export function regionChoices(language = navigator.language): { code: string; name: string }[] {
  const codes: string[] = [];
  for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) codes.push(String.fromCharCode(a, b));
  const names = new Intl.DisplayNames([language], { type: "region", fallback: "none" });
  return codes
    .map((code) => ({ code, name: names.of(code) ?? "" }))
    .filter((r) => r.name && r.name !== r.code)
    .sort((x, y) => x.name.localeCompare(y.name));
}
