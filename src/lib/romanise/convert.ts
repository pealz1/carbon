// Romanisation engines, each loaded the first time a lyric needs it: kuroshiro with kuromoji for
// Japanese (its dictionary is served by Carbon itself from /kuromoji/, never a CDN), pinyin-pro and
// opencc-js for Chinese, es-hangul for Korean. Nothing here imports them up front, so they stay out
// of the main bundle.
import type { KuromojiToken } from "@sglkc/kuroshiro-analyzer-kuromoji";
import type { Script } from "./script";

export interface RubyPart {
  text: string;
  /** Hiragana reading shown over kanji. */
  reading?: string;
}

export interface LineAid {
  roman: string;
  /** The line with readings over its kanji (Japanese, when furigana is on). */
  ruby?: RubyPart[];
}

let dictPath = "/kuromoji/";
/** Tests point kuromoji at the dictionary on disk. */
export const useDictionary = (path: string): void => void (dictPath = path);

/** Loads once and shares the result; a failed load can be tried again. */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () =>
    (pending ??= load().catch((e) => {
      pending = null;
      throw e;
    }));
}

const KANJI = /\p{Script=Han}/u;
const toHiragana = (text: string): string => text.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/** One space between words and none before closing punctuation, whatever the engine put out. */
export const tidy = (text: string): string =>
  text
    .replace(/\s+/g, " ")
    .replace(/ ([,.!?;:)\]」』、。，．！？])/g, "$1")
    .replace(/([([「『]) /g, "$1")
    .trim();

/** Ruby parts from kuromoji tokens: readings sit over the kanji only, not the kana around them. */
export function furiganaParts(tokens: KuromojiToken[]): RubyPart[] {
  const parts: RubyPart[] = [];
  const add = (text: string, reading?: string) => {
    if (!text) return;
    const last = parts.at(-1);
    if (!reading && last && !last.reading) parts[parts.length - 1] = { text: last.text + text };
    else parts.push(reading ? { text, reading } : { text });
  };
  for (const { surface_form: s, reading: raw } of tokens) {
    const r = raw && raw !== "*" ? toHiragana(raw) : "";
    if (!r || !KANJI.test(s)) {
      add(s);
      continue;
    }
    const kana = (c: string | undefined, k: string | undefined) => !!c && !KANJI.test(c) && toHiragana(c) === k;
    let head = 0;
    let tail = 0;
    while (head < s.length - tail && kana(s[head], r[head])) head++;
    while (tail < s.length - head && kana(s[s.length - 1 - tail], r[r.length - 1 - tail])) tail++;
    add(s.slice(0, head));
    add(s.slice(head, s.length - tail), r.slice(head, r.length - tail) || undefined);
    add(s.slice(s.length - tail));
  }
  return parts;
}

const japanese = once(async () => {
  const [{ default: Kuroshiro }, { default: Analyzer }] = await Promise.all([import("kuroshiro"), import("@sglkc/kuroshiro-analyzer-kuromoji")]);
  const analyzer = new Analyzer({ dictPath });
  const kuroshiro = new Kuroshiro();
  await kuroshiro.init(analyzer);
  return {
    roman: (text: string) => kuroshiro.convert(text, { to: "romaji", mode: "spaced", romajiSystem: "hepburn" }),
    ruby: async (text: string) => furiganaParts(await analyzer.parse(text)),
  };
});

const converters = {
  simplified: once(async () => (await import("opencc-js/t2cn")).Converter({ from: "tw", to: "cn" })),
  traditional: once(async () => (await import("opencc-js/cn2t")).Converter({ from: "cn", to: "tw" })),
};

/** Converts Chinese text to simplified or traditional characters. */
export const converter = (target: keyof typeof converters): Promise<(text: string) => string> => converters[target]();

// pinyin-pro reads some traditional characters wrongly, so it gets simplified text.
const pinyin = once(async () => {
  const [{ pinyin }, simplify] = await Promise.all([import("pinyin-pro"), converter("simplified")]);
  return (text: string) => pinyin(simplify(text), { toneType: "symbol", nonZh: "consecutive" });
});

const hangul = once(async () => (await import("es-hangul")).romanize);

/** The romanisation of one line in a known script, plus furigana for Japanese when asked. */
export async function aidFor(text: string, script: Script, furigana: boolean): Promise<LineAid> {
  if (script === "ja") {
    const ja = await japanese();
    const roman = tidy(await ja.roman(text));
    return furigana ? { roman, ruby: await ja.ruby(text) } : { roman };
  }
  const romanise = script === "zh" ? await pinyin() : await hangul();
  return { roman: tidy(romanise(text)) };
}
