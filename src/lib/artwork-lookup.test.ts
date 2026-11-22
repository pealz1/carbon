import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Song } from "$lib/providers/catalog";

const h = vi.hoisted(() => ({ searchCatalog: vi.fn() }));
vi.mock("$lib/providers/catalog", () => ({ searchCatalog: h.searchCatalog }));

const { artworkFor, pickArtwork } = await import("./artwork-lookup");

const COVER = "https://cdn-images.dzcdn.net/images/cover/abc/250x250-000000-80-0-0.jpg";
const hit = (title: string, artist: string, image: string | undefined = COVER): Song => ({ title, artist, durationMs: 0, image });

describe("picking the right hit", () => {
  it("takes the first hit that is this song by this artist, at the larger size", () => {
    const hits = [hit("Lucky", "Britney Spears", "https://cdn-images.dzcdn.net/images/cover/other/250x250-000000-80-0-0.jpg"), hit("Get Lucky (Radio Edit - feat. Pharrell Williams)", "Daft Punk")];
    expect(pickArtwork("Get Lucky", "Daft Punk", hits)).toBe("https://cdn-images.dzcdn.net/images/cover/abc/500x500-000000-80-0-0.jpg");
  });

  it("ignores bracketed notes, case and accents on either side", () => {
    expect(pickArtwork("São Paulo [Live]", "ANA", [hit("Sao Paulo", "Ana")])).not.toBeNull();
    expect(pickArtwork("Get Lucky (feat. Pharrell Williams)", "Daft Punk, Pharrell Williams", [hit("Get Lucky", "Daft Punk")])).not.toBeNull();
  });

  it("is a miss rather than a guess", () => {
    expect(pickArtwork("Get Lucky", "Daft Punk", [hit("Get Lucky", "Some Cover Band")])).toBeNull();
    expect(pickArtwork("Get Lucky", "Daft Punk", [hit("Instant Crush", "Daft Punk")])).toBeNull();
    expect(pickArtwork("Intro", "", [hit("Intro", "The xx")])).toBeNull();
    expect(pickArtwork("Get Lucky", "Daft Punk", [])).toBeNull();
  });

  it("only ever answers with an https address", () => {
    expect(pickArtwork("Get Lucky", "Daft Punk", [hit("Get Lucky", "Daft Punk", "http://cdn.test/a.jpg"), { ...hit("Get Lucky", "Daft Punk"), image: undefined }])).toBeNull();
  });
});

describe("looking a song up", () => {
  beforeEach(() => h.searchCatalog.mockReset());

  it("asks Deezer once per song and remembers a miss too", async () => {
    h.searchCatalog.mockResolvedValue([hit("Unique Hit", "Asked Once")]);
    expect(await artworkFor("Unique Hit", "Asked Once")).toContain("/500x500-");
    expect(await artworkFor("unique hit", "ASKED ONCE")).toContain("/500x500-");
    expect(h.searchCatalog).toHaveBeenCalledTimes(1);
    expect(h.searchCatalog).toHaveBeenCalledWith("deezer", "Asked Once Unique Hit");

    h.searchCatalog.mockResolvedValue([]);
    expect(await artworkFor("Nothing There", "Nobody")).toBeNull();
    expect(await artworkFor("Nothing There", "Nobody")).toBeNull();
    expect(h.searchCatalog).toHaveBeenCalledTimes(2);
  });

  it("never rejects, and tries again after Deezer couldn't be reached", async () => {
    h.searchCatalog.mockRejectedValueOnce("Could not reach Deezer.").mockResolvedValue([hit("Flaky Song", "Flaky Artist")]);
    expect(await artworkFor("Flaky Song", "Flaky Artist")).toBeNull();
    expect(await artworkFor("Flaky Song", "Flaky Artist")).toContain("https://");
  });

  it("asks nothing without both a title and an artist", async () => {
    expect(await artworkFor("Title Only", " ")).toBeNull();
    expect(await artworkFor("", "Artist Only")).toBeNull();
    expect(h.searchCatalog).not.toHaveBeenCalled();
  });

  it("keeps at most 300 answers, dropping the oldest", async () => {
    h.searchCatalog.mockResolvedValue([]);
    await artworkFor("First Song", "Evicted");
    for (let i = 0; i < 300; i++) await artworkFor(`Filler ${i}`, "Someone");
    const before = h.searchCatalog.mock.calls.length;
    await artworkFor("Filler 299", "Someone");
    expect(h.searchCatalog).toHaveBeenCalledTimes(before);
    await artworkFor("First Song", "Evicted");
    expect(h.searchCatalog).toHaveBeenCalledTimes(before + 1);
  });
});
