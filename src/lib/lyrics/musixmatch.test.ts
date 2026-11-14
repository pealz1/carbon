import { describe, expect, it } from "vitest";
import type { Track } from "$lib/spotify/types";
import { fromMusixmatch, parseRichsync, type MusixmatchRaw } from "./musixmatch";

const track: Track = {
  id: "t",
  uri: "spotify:track:t",
  name: "Get Lucky",
  artists: [{ id: "a", name: "Daft Punk", uri: "spotify:artist:a" }],
  album: { id: "al", name: "Random Access Memories", uri: "spotify:album:al", image: null },
  durationMs: 369_600,
  explicit: false,
};

// Shaped like a real richsync body (ts/te in seconds, each part's offset into the line); the words are placeholders.
const RICHSYNC = JSON.stringify([
  { ts: 31.53, te: 36.03, l: [{ c: "first", o: 0 }, { c: " ", o: 0.103 }, { c: "placeholder", o: 0.2039 }, { c: " ", o: 1.242 }, { c: "line", o: 1.582 }], x: "first placeholder line" },
  { ts: 36.03, te: 37.364, l: [{ c: "second", o: 0 }, { c: " ", o: 0.203 }, { c: "line", o: 0.269 }], x: "second line" },
]);

const raw = (over: Partial<MusixmatchRaw> = {}): MusixmatchRaw => ({
  trackName: "Get Lucky (feat. Pharrell Williams and Nile Rodgers)",
  artistName: "Daft Punk feat. Pharrell Williams & Nile Rodgers",
  durationS: 370,
  instrumental: false,
  richsync: RICHSYNC,
  subtitle: "[00:31.53] first placeholder line\n[00:36.03] second line\n[00:47.23] ",
  plain: "first placeholder line\nsecond line",
  ...over,
});

describe("parseRichsync", () => {
  it("times each word from its offset, ending it where the space after it starts", () => {
    expect(parseRichsync(RICHSYNC)).toEqual([
      {
        timeMs: 31530,
        text: "first placeholder line",
        words: [
          { text: "first ", startMs: 31530, endMs: 31633 },
          { text: "placeholder ", startMs: 31734, endMs: 32772 },
          { text: "line", startMs: 33112, endMs: 36030 },
        ],
      },
      { timeMs: 36030, text: "second line", words: [{ text: "second ", startMs: 36030, endMs: 36233 }, { text: "line", startMs: 36299, endMs: 37364 }] },
    ]);
  });

  it("keeps a line without usable words as a line, and survives anything else", () => {
    const loose = JSON.stringify([{ ts: 2, x: "no parts" }, { ts: 1, l: [{ c: "bad" }], x: " odd parts " }, { x: "no time" }, null, { ts: 3, l: [{ c: "open", o: 0 }], x: "open" }]);
    expect(parseRichsync(loose)).toEqual([
      { timeMs: 1000, text: "odd parts" },
      { timeMs: 2000, text: "no parts" },
      { timeMs: 3000, text: "open", words: [{ text: "open", startMs: 3000, endMs: 5500 }] }, // no end given: capped like LRC's last word
    ]);
    expect(parseRichsync("")).toEqual([]);
    expect(parseRichsync('{"not":"rows"}')).toEqual([]);
  });
});

describe("fromMusixmatch", () => {
  it("prefers word timing, then line timing, then the text", () => {
    const words = fromMusixmatch(raw(), track);
    expect(words.kind === "synced" && words.lines[0].words?.length).toBe(3);
    const lines = fromMusixmatch(raw({ richsync: "" }), track);
    expect(lines).toEqual({ kind: "synced", lines: [{ timeMs: 31530, text: "first placeholder line" }, { timeMs: 36030, text: "second line" }, { timeMs: 47230, text: "" }] });
    expect(fromMusixmatch(raw({ richsync: "", subtitle: "" }), track)).toEqual({ kind: "plain", text: "first placeholder line\nsecond line" });
    expect(fromMusixmatch(raw({ instrumental: true }), track)).toEqual({ kind: "instrumental" });
  });

  it("shows nothing when Musixmatch isn't answering or has nothing", () => {
    expect(fromMusixmatch(null, track)).toEqual({ kind: "none" });
    expect(fromMusixmatch(raw({ richsync: "", subtitle: "", plain: "" }), track)).toEqual({ kind: "none" });
  });

  it("refuses a match that is another song, as its decoy answers are", () => {
    expect(fromMusixmatch(raw({ trackName: "NOKIA", artistName: "Drake", durationS: 0 }), track)).toEqual({ kind: "none" });
    expect(fromMusixmatch(raw({ durationS: 250 }), track)).toEqual({ kind: "none" });
    expect(fromMusixmatch(raw({ durationS: 0 }), track).kind).toBe("synced"); // no length given: the names decide
  });

  it("drops text that is only the start of the lyrics plus a notice", () => {
    const partial = "first placeholder line\n...\n\n******* This Lyrics is NOT for Commercial use *******\n(1409600000000)";
    expect(fromMusixmatch(raw({ richsync: "", subtitle: "", plain: partial }), track)).toEqual({ kind: "none" });
  });
});
