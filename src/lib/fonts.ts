// Chosen font families (Settings → Appearance) as CSS custom properties on the document root.
import type { Settings } from "$lib/native";

export type FontKey = "fontText" | "fontDisplay" | "fontLyrics";

export interface FontRole {
  key: FontKey;
  label: string;
  /** The custom property components read. */
  variable: string;
  /** Carbon's own stack (app.css), kept after a chosen family so missing glyphs still render. */
  fallback: string;
}

export const FONT_ROLES: readonly FontRole[] = [
  { key: "fontText", label: "Interface text", variable: "--font-text", fallback: "var(--font-text-default)" },
  { key: "fontDisplay", label: "Titles and headings", variable: "--font-display", fallback: "var(--font-display-default)" },
  { key: "fontLyrics", label: "Lyrics", variable: "--font-lyrics", fallback: "var(--font-display-default)" },
];

/** A CSS string literal. Rust already refuses unsafe names; this keeps a bad one from escaping anyway. */
export function cssString(value: string): string {
  return `"${value.replace(/[\\"]/g, "\\$&").replace(/[\u0000-\u001f\u007f]/g, " ")}"`;
}

export const fontStack = (family: string, fallback: string): string => `${cssString(family)}, ${fallback}`;

/** Picker options for a search: "" (Default) first while it matches, then installed families. */
export function matchFonts(fonts: readonly string[], query: string): string[] {
  const q = query.trim().toLowerCase();
  return [...("default".includes(q) ? [""] : []), ...fonts.filter((f) => f.toLowerCase().includes(q))];
}

/** "" (Default) removes the override so app.css's own value applies. */
export function applyFonts(root: HTMLElement, settings: Pick<Settings, FontKey>): void {
  for (const { key, variable, fallback } of FONT_ROLES) {
    const family = settings[key];
    if (family) root.style.setProperty(variable, fontStack(family, fallback));
    else root.style.removeProperty(variable);
  }
}
