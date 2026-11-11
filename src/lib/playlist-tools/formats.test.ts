import { describe, expect, it } from "vitest";
import { csvCell, exportText, parseCsv, parseCsvCells, parseImport, parseJson, parseM3u, toCsv, toM3u } from "./formats";
import type { Row } from "./rows";

const row = (over: Partial<Row> = {}): Row => ({
  uri: "spotify:track:0123456789abcdefABCDEF",
  name: "Placeholder Song",
  artists: ["First Artist", "Second Artist"],
  album: "Sample Album",
  durationMs: 201_000,
  addedAt: "2026-01-02T03:04:05Z",
  releaseDate: "2024-05-17",
  isrc: "USAAA2400001",
  explicit: false,
  path: null,
  track: null,
  ...over,
});

describe("export", () => {
  it("quotes CSV cells and defuses spreadsheet formulas", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('say "hi", twice')).toBe('"say ""hi"", twice"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("-1,5")).toBe(`"'-1,5"`);
  });

  it("writes a header and one line per song", () => {
    const lines = toCsv([row(), row({ name: "Line\nbreak" })]).trim().split("\r\n");
    expect(lines[0]).toBe("Title,Artist,Album,Duration (ms),ISRC,URI,Path,Added at,Release date");
    expect(lines[1]).toBe('Placeholder Song,"First Artist, Second Artist",Sample Album,201000,USAAA2400001,spotify:track:0123456789abcdefABCDEF,,2026-01-02T03:04:05Z,2024-05-17');
  });

  it("writes M3U with paths for local files and links for streamed songs", () => {
    const text = toM3u([row(), row({ uri: "local:abc", path: "C:\\Music\\a.flac", artists: ["Local Artist"], name: "Local Song" }), row({ uri: "ytm:video:abc_DEF-123" })]);
    expect(text.split("\r\n")).toEqual([
      "#EXTM3U",
      "#EXTINF:201,First Artist, Second Artist - Placeholder Song",
      "https://open.spotify.com/track/0123456789abcdefABCDEF",
      "#EXTINF:201,Local Artist - Local Song",
      "C:\\Music\\a.flac",
      "#EXTINF:201,First Artist, Second Artist - Placeholder Song",
      "https://music.youtube.com/watch?v=abc_DEF-123",
      "",
    ]);
  });

  it("leaves unavailable rows out", () => {
    const json = JSON.parse(exportText("json", "Mix", [row(), row({ uri: "", name: "Unavailable" })]));
    expect(json.name).toBe("Mix");
    expect(json.tracks).toHaveLength(1);
    expect(json.tracks[0]).toMatchObject({ title: "Placeholder Song", artists: ["First Artist", "Second Artist"], isrc: "USAAA2400001" });
  });
});

describe("import", () => {
  it("parses quoted CSV with CRLF and embedded commas, quotes and newlines", () => {
    expect(parseCsvCells('a,"b,c","d ""e"""\r\n"multi\nline",x,\r\n')).toEqual([
      ["a", "b,c", 'd "e"'],
      ["multi\nline", "x", ""],
    ]);
  });

  it("round-trips Carbon's own CSV and JSON", () => {
    const rows = [row(), row({ uri: "local:abc", path: "C:\\Music\\a.flac", name: "=Danger" })];
    const csv = parseCsv(exportText("csv", "Mix", rows));
    expect(csv[0]).toEqual({ title: "Placeholder Song", artist: "First Artist, Second Artist", album: "Sample Album", durationMs: 201000, isrc: "USAAA2400001", uri: "spotify:track:0123456789abcdefABCDEF", path: null });
    expect(csv[1]).toMatchObject({ title: "=Danger", uri: "local:abc", path: "C:\\Music\\a.flac" });
    expect(parseJson(exportText("json", "Mix", rows))).toEqual(csv);
  });

  it("reads other tools' column names", () => {
    const text = 'Track URI,Track Name,Artist Name(s),Album Name,Duration (ms),ISRC\r\nspotify:track:0123456789abcdefABCDEF,Song A,Artist A,Album A,1000,GBAAA0000001\r\n';
    expect(parseCsv(text)).toEqual([{ title: "Song A", artist: "Artist A", album: "Album A", durationMs: 1000, isrc: "GBAAA0000001", uri: "spotify:track:0123456789abcdefABCDEF", path: null }]);
  });

  it("reads M3U info lines, file URLs and bare paths", () => {
    const rows = parseM3u("#EXTM3U\n#EXTINF:123,Some Artist - A - B\nfile:///C:/Music/My%20Song.mp3\n\nrelative\\song.flac\n");
    expect(rows).toEqual([
      { title: "A - B", artist: "Some Artist", album: "", durationMs: 123000, isrc: null, uri: null, path: "C:/Music/My Song.mp3" },
      { title: "", artist: "", album: "", durationMs: null, isrc: null, uri: null, path: "relative\\song.flac" },
    ]);
  });

  it("accepts a bare JSON list and rejects files without songs", () => {
    expect(parseJson('[{"name":"Song","artist":"Someone","duration_ms":5}]')[0]).toMatchObject({ title: "Song", artist: "Someone", durationMs: 5 });
    expect(() => parseJson('{"hello":1}')).toThrow();
    expect(() => parseImport("csv", "Title\r\n")).toThrow("couldn't find any songs");
  });
});
