// Which writing system a lyric line is in, for romanisation. Han characters alone can be Japanese or
// Chinese, so the song decides: any kana anywhere makes its Han-only lines Japanese.
export type Script = "ja" | "zh" | "ko";

const HANGUL = /\p{Script=Hangul}/u;
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const HAN = /\p{Script=Han}/u;

function lineScript(text: string): Script | "han" | null {
  if (HANGUL.test(text)) return "ko";
  if (KANA.test(text)) return "ja";
  return HAN.test(text) ? "han" : null;
}

/** The script of each line, or null for lines that need no romanisation. */
export function detectScripts(texts: string[]): (Script | null)[] {
  const found = texts.map(lineScript);
  const han: Script = found.includes("ja") ? "ja" : "zh";
  return found.map((s) => (s === "han" ? han : s));
}

/** The script most lines are in, or null when nothing needs romanising. */
export function mainScript(scripts: (Script | null)[]): Script | null {
  const counts = new Map<Script, number>();
  for (const s of scripts) if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
  let best: Script | null = null;
  for (const [script, n] of counts) if (!best || n > (counts.get(best) ?? 0)) best = script;
  return best;
}
