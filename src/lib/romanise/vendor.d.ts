// Types for the two Japanese libraries, which ship none. Only what Carbon calls.
declare module "kuroshiro" {
  export interface ConvertOptions {
    to: "romaji" | "hiragana" | "katakana";
    mode?: "normal" | "spaced" | "okurigana" | "furigana";
    romajiSystem?: "nippon" | "passport" | "hepburn";
  }

  export default class Kuroshiro {
    init(analyzer: unknown): Promise<void>;
    convert(text: string, options: ConvertOptions): Promise<string>;
  }
}

declare module "@sglkc/kuroshiro-analyzer-kuromoji" {
  export interface KuromojiToken {
    surface_form: string;
    /** Katakana, or "*" / absent when kuromoji doesn't know the word. */
    reading?: string;
  }

  export default class KuromojiAnalyzer {
    constructor(options?: { dictPath?: string });
    init(): Promise<void>;
    parse(text: string): Promise<KuromojiToken[]>;
  }
}
