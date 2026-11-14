import { describe, expect, it } from "vitest";
import { artistEntry, describeReason, needsFacts, parseVersions, ruleReason, sameItem, skippedVersion, skipReason, songEntry, versionNotes } from "./blocklist";
import type { Blocked, BlocklistData } from "./native";
import type { Track } from "./spotify/types";

const song = (uri: string, artists: { name: string; uri: string }[], explicit = false): Track => ({
  id: uri.split(":").at(-1)!,
  uri,
  name: "Placeholder song",
  artists: artists.map((a) => ({ id: "", ...a })),
  album: null,
  durationMs: 1000,
  explicit,
});

const blocked = (kind: Blocked["kind"], uri: string, name = "Name"): Blocked => ({ kind, uri, name, by: "" });
const list = (items: Blocked[], skipExplicit = false): BlocklistData => ({ items, skipExplicit });

describe("standing rules", () => {
  it("skip by likes only when the like is known", () => {
    expect(ruleReason({ ...list([]), skipByLike: "liked" }, { liked: true })?.name).toBe("already in your likes");
    expect(ruleReason({ ...list([]), skipByLike: "liked" }, { liked: false })).toBeNull();
    expect(ruleReason({ ...list([]), skipByLike: "unliked" }, { liked: false })?.name).toBe("not in your likes");
    expect(ruleReason({ ...list([]), skipByLike: "unliked" }, {})).toBeNull();
  });

  it("skip a song the listener keeps skipping", () => {
    const rules = { ...list([]), skipAfter: 3 };
    expect(ruleReason(rules, { skips: 2 })).toBeNull();
    expect(describeReason(ruleReason(rules, { skips: 3 })!)).toBe("you've skipped it 3 times");
    expect(ruleReason({ ...list([]), skipAfter: 0 }, { skips: 50 })).toBeNull();
  });

  it("skip by an artist's genre, whole words only", () => {
    const rules = { ...list([]), skipGenres: ["Country", "metal"] };
    expect(ruleReason(rules, { genres: ["contemporary country"] })?.name).toBe("contemporary country is a genre you skip");
    expect(ruleReason(rules, { genres: ["metalcore"] })).toBeNull();
    expect(ruleReason(rules, { genres: [] })).toBeNull();
  });

  it("only look up what a rule that is on needs", () => {
    expect(needsFacts(list([]))).toEqual({ liked: false, skips: false, genres: false });
    expect(needsFacts({ ...list([]), skipByLike: "liked", skipAfter: 2, skipGenres: ["jazz"] })).toEqual({ liked: true, skips: true, genres: true });
  });
});

describe("skipping versions", () => {
  it("reads a title's version notes from its brackets and after its dash", () => {
    expect(versionNotes("Song (Live at Wembley) [2011 Remaster]")).toContain("live at wembley");
    expect(versionNotes("Song - Acoustic Version")).toContain("acoustic version");
    expect(versionNotes("Live and Let Die").trim()).toBe("");
  });

  it("matches whole words in the notes only", () => {
    expect(skippedVersion("Song (Live at Wembley)", ["remix", "live"])).toBe("live");
    expect(skippedVersion("Song - Sped Up", ["sped up"])).toBe("sped up");
    expect(skippedVersion("Live and Let Die", ["live"])).toBeNull();
    expect(skippedVersion("Song (Alive Mix)", ["live"])).toBeNull();
    expect(skippedVersion("Song (feat. C++ Crew)", ["c++"])).toBe("c++");
    expect(skippedVersion("Song (Live)", [])).toBeNull();
  });

  it("skips a matching song, after blocks and explicit, and says why", () => {
    const live = { ...song("spotify:track:t9", [{ name: "Lead", uri: "spotify:artist:a1" }]), name: "Anthem (Live)" };
    const rules = { ...list([]), skipVersions: ["live"] };
    expect(skipReason(live, rules)).toEqual({ kind: "version", name: "live" });
    expect(describeReason({ kind: "version", name: "live" })).toBe("live version");
    expect(skipReason(live, list([]))).toBeNull(); // lists saved before versions existed
    expect(skipReason({ ...live, explicit: true }, { ...rules, skipExplicit: true })).toBe("explicit");
  });

  it("tidies what the listener types", () => {
    expect(parseVersions(" Live, remix ,, LIVE , sped  up ")).toEqual(["live", "remix", "sped  up"]);
    expect(parseVersions("")).toEqual([]);
    expect(parseVersions(Array.from({ length: 40 }, (_, i) => `w${i}`).join(","))).toHaveLength(30);
  });
});

describe("skipReason", () => {
  const spotify = song("spotify:track:t1", [
    { name: "Lead", uri: "spotify:artist:a1" },
    { name: "Guest", uri: "spotify:artist:a2" },
  ]);
  const youtube = song("ytm:video:v1", [{ name: "Some Uploader", uri: "" }], true);

  it("matches a blocked song by its link", () => {
    const item = blocked("song", "spotify:track:t1");
    expect(skipReason(spotify, list([item]))).toBe(item);
    expect(skipReason(spotify, list([blocked("song", "spotify:track:other")]))).toBeNull();
  });

  it("matches any credited artist, by link, or by name when either side has none", () => {
    const guest = blocked("artist", "spotify:artist:a2");
    expect(skipReason(spotify, list([guest]))).toBe(guest);
    const byName = blocked("artist", "", " some uploader ");
    expect(skipReason(youtube, list([byName]))).toBe(byName);
    // Two different links never match, even with the same name.
    expect(skipReason(spotify, list([blocked("artist", "ytm:artist:UC1", "Lead")]))).toBeNull();
  });

  it("skips explicit songs only when asked, using the looked-up flag when given", () => {
    expect(skipReason(youtube, list([], false))).toBeNull();
    expect(skipReason(youtube, list([], true))).toBe("explicit");
    expect(skipReason(spotify, list([], true))).toBeNull();
    expect(skipReason(spotify, list([], true), true)).toBe("explicit");
  });

  it("explains each reason", () => {
    expect(describeReason("explicit")).toBe("explicit");
    expect(describeReason(blocked("song", "spotify:track:t1"))).toBe("blocked song");
    expect(describeReason(blocked("artist", "", "Band"))).toBe("Band is blocked");
  });
});

describe("entries", () => {
  it("tells entries apart by kind and link, or by name without one", () => {
    expect(sameItem(blocked("artist", "spotify:artist:a1"), "artist", { uri: "spotify:artist:a1", name: "x" })).toBe(true);
    expect(sameItem(blocked("artist", "spotify:artist:a1"), "song", { uri: "spotify:artist:a1", name: "x" })).toBe(false);
    expect(sameItem(blocked("artist", "", "Band"), "artist", { uri: "", name: "band " })).toBe(true);
    expect(sameItem(blocked("artist", "", "Band"), "artist", { uri: "ytm:artist:UC1", name: "Band" })).toBe(false);
  });

  it("builds entries with who a song is by, within the saved length", () => {
    const track = { ...song("ytm:video:v1", [{ name: "A", uri: "" }, { name: " B ", uri: "" }]), name: `  ${"é".repeat(400)}  ` };
    const entry = songEntry(track);
    expect(entry).toMatchObject({ kind: "song", uri: "ytm:video:v1", by: "A, B" });
    expect(Array.from(entry.name)).toHaveLength(300);
    expect(songEntry({ ...track, name: "  " }).name).toBe("Untitled");
    expect(artistEntry({ id: "a", name: " Band ", uri: "spotify:artist:a" })).toEqual({ kind: "artist", uri: "spotify:artist:a", name: "Band", by: "" });
  });
});
