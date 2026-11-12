// Romanised and script-converted lyrics for the lyrics views. Works out what each line needs and
// loads only those engines; until it's done the views show the lyrics as they are.
import type { Lyrics } from "$lib/lyrics";
import type { ChineseScript } from "$lib/native";
import { aidFor, converter, type LineAid } from "./convert";
import { detectScripts, type Script } from "./script";

export type { LineAid, RubyPart } from "./convert";

export interface AidOptions {
  romanise: boolean;
  furigana: boolean;
  chinese: ChineseScript;
}

export interface Aided {
  /** The lyrics with Chinese lines in the chosen characters. */
  lyrics: Lyrics;
  /** Romanisation by line text (as shown). */
  aids: Map<string, LineAid>;
}

export function textsOf(lyrics: Lyrics): string[] {
  if (lyrics.kind === "synced") return lyrics.lines.map((l) => l.text);
  return lyrics.kind === "plain" ? lyrics.text.split("\n") : [];
}

/** Whether `prepare` would change anything. */
export const needsAids = (scripts: (Script | null)[], options: AidOptions): boolean =>
  scripts.some((s) => s && (options.romanise || (s === "zh" && options.chinese !== "original")));

async function convertChinese(lyrics: Lyrics, scripts: (Script | null)[], target: ChineseScript): Promise<Lyrics> {
  if (target === "original" || !scripts.includes("zh")) return lyrics;
  const convert = await converter(target);
  if (lyrics.kind === "plain") {
    return { kind: "plain", text: textsOf(lyrics).map((text, i) => (scripts[i] === "zh" ? convert(text) : text)).join("\n") };
  }
  if (lyrics.kind !== "synced") return lyrics;
  const lines = lyrics.lines.map((line, i) =>
    scripts[i] === "zh" ? { ...line, text: convert(line.text), words: line.words?.map((w) => ({ ...w, text: convert(w.text) })) } : line,
  );
  return { kind: "synced", lines };
}

export async function prepare(lyrics: Lyrics, options: AidOptions): Promise<Aided> {
  const scripts = detectScripts(textsOf(lyrics));
  const shown = await convertChinese(lyrics, scripts, options.chinese);
  const aids = new Map<string, LineAid>();
  if (!options.romanise) return { lyrics: shown, aids };
  for (const [i, text] of textsOf(shown).entries()) {
    const script = scripts[i];
    if (script && text.trim() && !aids.has(text)) aids.set(text, await aidFor(text, script, options.furigana));
  }
  return { lyrics: shown, aids };
}
