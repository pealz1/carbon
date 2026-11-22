// @vitest-environment jsdom
// The search page mounted for real: typing, the address, sections filling in as sources answer,
// one source failing, a late answer for an old term, the pills, and a pasted Tidal link. The
// sources themselves are stood in for (adapters.ts), as are the player and the rows that need it.
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Song } from "$lib/providers/catalog";
import type { Track } from "$lib/spotify/types";
import { NOTHING, type Results } from "./map";
import type { SourceId } from "./sources";

// Vitest resolves "svelte" to its server build, which can't mount: ask for the client build by path.
// @ts-expect-error The client build has no declaration file at this path.
vi.mock("svelte", () => import("../../../node_modules/svelte/src/index-client.js"));

class Address {
  url = $state(new URL("http://localhost/search"));
}
const address = new Address();
const goto = vi.fn(async (to: string) => void (address.url = new URL(to, address.url)));
const invoke = vi.fn();
const searchSource = vi.fn<(id: SourceId, term: string) => Promise<Results>>();
const matchOn = vi.fn();
const player = { paused: true, isCurrent: () => false, playTracks: vi.fn(async () => {}), playStation: vi.fn(), togglePlay: vi.fn() };
const toasts = { show: vi.fn(), error: vi.fn() };

vi.doMock("$app/state", () => ({ page: address }));
vi.doMock("$app/navigation", () => ({ goto }));
vi.doMock("@tauri-apps/api/core", () => ({ invoke }));
vi.doMock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
vi.doMock("$lib/services.svelte", () => ({ services: { active: { spotify: false, youtube: true, home: "/youtube" } } }));
vi.doMock("$lib/servers/session.svelte", () => ({ serverSession: { list: [], load: vi.fn() } }));
vi.doMock("$lib/search/adapters", () => ({ searchSource, matchOn }));
vi.doMock("$lib/player.svelte", () => ({ player }));
vi.doMock("$lib/toast.svelte", () => ({ toasts }));
// Song rows, cards and shelves bring the whole player with them; an inert component stands in.
for (const heavy of ["TrackList", "MediaCard", "Shelf"]) vi.doMock(`$lib/components/${heavy}.svelte`, () => import("$lib/components/Status.svelte"));

const { default: SearchPage } = await import("../../routes/search/+page.svelte");

const DEBOUNCE_MS = 250;
const TIDAL = "https://tidal.com/browse/track/251380837";
const hit = (title: string, id: number): Song => ({ title, artist: "Daft Punk", durationMs: 248_000, url: `https://www.deezer.com/track/${id}` });
const track: Track = { id: "v", uri: "ytm:video:v", name: "Get Lucky", artists: [{ id: "", name: "Daft Punk", uri: "" }], album: null, durationMs: 248_000, explicit: false };

/** Each source's answer, settled by hand so the order they arrive in is the test's to choose. */
let asked: { id: SourceId; term: string; answer: (results: Results) => void; fail: (reason: string) => void }[] = [];
let app: ReturnType<typeof mount> | undefined;

const text = () => document.body.textContent ?? "";
const input = () => document.querySelector<HTMLInputElement>("input[type=search]")!;
const pill = (name: string) => [...document.querySelectorAll<HTMLElement>("[role=tab]")].find((b) => b.textContent?.trim() === name)!;
const sections = () => [...document.querySelectorAll("section.source h2")].map((h) => h.textContent);
const button = (label: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(label))!;
const settle = async (ms = 0) => {
  await vi.advanceTimersByTimeAsync(ms);
  flushSync();
};
async function type(value: string) {
  input().value = value;
  input().dispatchEvent(new Event("input", { bubbles: true }));
  await settle(DEBOUNCE_MS);
}
const answerOf = (id: SourceId, term: string) => asked.findLast((a) => a.id === id && a.term === term)!;

async function open(search = "") {
  address.url = new URL(`http://localhost/search${search}`);
  app = mount(SearchPage, { target: document.body });
  await settle();
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  asked = [];
  for (const mock of [goto, invoke, searchSource, matchOn, player.playTracks, toasts.show, toasts.error]) mock.mockClear();
  invoke.mockImplementation(async (command: string) => {
    if (command === "provider_connections") return { soundcloud: false, soundcloudUser: false };
    if (command === "tidal_shared") return { title: "Get Lucky", artist: "Daft Punk", image: null, durationMs: 248_000 };
    throw `unexpected command ${command}`;
  });
  searchSource.mockImplementation((id, term) => new Promise<Results>((answer, fail) => asked.push({ id, term, answer, fail })));
});

afterEach(async () => {
  if (app) await unmount(app);
  app = undefined;
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("with nothing typed", () => {
  it("offers the sources' own pages and the recent searches, which can be cleared", async () => {
    localStorage.setItem("carbon-recent-searches", JSON.stringify(["daft punk", "nina simone"]));
    await open();
    // Every page nav.ts files under Search, for the services that are on (here: YouTube Music).
    expect([...document.querySelectorAll<HTMLAnchorElement>(".browse a")].map((a) => a.getAttribute("href"))).toEqual(["/youtube/search", "/soundcloud", "/apple", "/deezer", "/mixcloud", "/bandcamp", "/archive"]);
    expect(text()).toContain("nina simone");
    expect(searchSource).not.toHaveBeenCalled();

    button("Clear").click();
    flushSync();
    expect(text()).not.toContain("nina simone");
    expect(localStorage.getItem("carbon-recent-searches")).toBeNull();
  });

  it("lists a pill for every source this setup has, and none it lacks", async () => {
    await open();
    const pills = [...document.querySelectorAll("[role=tab]")].map((b) => b.textContent?.trim());
    expect(pills).toEqual(["All", "YouTube Music", "Local files", "Bandcamp", "Radio", "Deezer", "Apple Music", "Mixcloud", "Internet Archive"]);
    expect(pill("All").getAttribute("aria-selected")).toBe("true");
  });

  it("searches again from a recent search", async () => {
    localStorage.setItem("carbon-recent-searches", JSON.stringify(["daft punk"]));
    await open();
    button("daft punk").click();
    await settle(DEBOUNCE_MS);
    expect(input().value).toBe("daft punk");
    expect(searchSource).toHaveBeenCalledWith("deezer", "daft punk");
  });
});

describe("searching everywhere", () => {
  it("waits for typing to pause, then asks every source and puts the term in the address", async () => {
    await open();
    input().value = "get lucky";
    input().dispatchEvent(new Event("input", { bubbles: true }));
    await settle(DEBOUNCE_MS - 1);
    expect(searchSource).not.toHaveBeenCalled();
    await settle(1);
    expect(searchSource.mock.calls.map(([id]) => id).sort()).toEqual(["apple", "archive", "bandcamp", "deezer", "local", "mixcloud", "radio", "youtube"]);
    expect(address.url.search).toBe("?q=get+lucky");
    expect(text()).toContain("Searching…");
  });

  it("fills in each source as it answers, and leaves out the ones with nothing", async () => {
    await open("?q=get+lucky");
    expect(sections()).toEqual([]);
    answerOf("deezer", "get lucky").answer({ ...NOTHING, hits: Array.from({ length: 9 }, (_, i) => hit(`Song ${i}`, i)) });
    answerOf("apple", "get lucky").answer(NOTHING);
    await settle();
    expect(sections()).toEqual(["Deezer"]);
    expect(document.querySelectorAll(".hit")).toHaveLength(4);
    expect(text()).toContain("Plays on YouTube Music");
    expect(text()).toContain("Searching…");
  });

  it("keeps a failed source to one quiet line and carries on with the rest", async () => {
    await open("?q=get+lucky");
    answerOf("mixcloud", "get lucky").fail("Could not reach Mixcloud.");
    answerOf("deezer", "get lucky").answer({ ...NOTHING, hits: [hit("Get Lucky", 1)] });
    await settle();
    expect(sections()).toEqual(["Deezer", "Mixcloud"]);
    expect(document.querySelector("section.source:last-of-type .quiet")?.textContent).toBe("Could not reach Mixcloud.");
    expect(document.querySelectorAll(".hit")).toHaveLength(1);
  });

  it("drops an answer that arrives for an earlier term", async () => {
    await open("?q=first");
    const stale = answerOf("deezer", "first");
    await type("second");
    stale.answer({ ...NOTHING, hits: [hit("Stale", 1)] });
    await settle();
    expect(text()).not.toContain("Stale");
    answerOf("deezer", "second").answer({ ...NOTHING, hits: [hit("Fresh", 2)] });
    await settle();
    expect(text()).toContain("Fresh");
  });

  it("says so when no source has anything", async () => {
    await open("?q=zzzz");
    for (const a of asked) a.answer(NOTHING);
    await settle();
    expect(sections()).toEqual([]);
    expect(text()).toContain("Nothing matches “zzzz”.");
    expect(text()).not.toContain("Searching…");
  });

  it("remembers a search once it has been looked at for a moment", async () => {
    await open();
    await type("get lu");
    await type("get lucky");
    await settle(1500);
    expect(JSON.parse(localStorage.getItem("carbon-recent-searches")!)).toEqual(["get lucky"]);
  });
});

describe("one source", () => {
  it("opens from More, shows everything it found, and lives in the address", async () => {
    await open("?q=get+lucky");
    answerOf("deezer", "get lucky").answer({ ...NOTHING, hits: Array.from({ length: 9 }, (_, i) => hit(`Song ${i}`, i)) });
    await settle();
    button("More from Deezer").click();
    await settle(DEBOUNCE_MS);
    expect(pill("Deezer").getAttribute("aria-selected")).toBe("true");
    expect(sections()).toEqual(["Deezer"]);
    expect(document.querySelectorAll(".hit")).toHaveLength(9);
    expect(address.url.search).toBe("?q=get+lucky&source=deezer");
    expect(text()).not.toContain("More from");
  });

  it("is chosen by the address, shows its own empty line, and falls back to All for a source it can't ask", async () => {
    await open("?q=get+lucky&source=apple");
    expect(pill("Apple Music").getAttribute("aria-selected")).toBe("true");
    expect(searchSource.mock.calls.map(([id]) => id)).toEqual(["apple"]);
    answerOf("apple", "get lucky").answer(NOTHING);
    await settle();
    expect(document.querySelector("section.source .quiet")?.textContent).toBe("No results.");
    await unmount(app!);
    await open("?q=get+lucky&source=spotify");
    expect(pill("All").getAttribute("aria-selected")).toBe("true");
  });

  it("follows a new address while already open, as the command palette sends one", async () => {
    await open("?q=first&source=deezer");
    await goto("/search?q=second");
    await settle(DEBOUNCE_MS);
    expect(input().value).toBe("second");
    expect(pill("All").getAttribute("aria-selected")).toBe("true");
    expect(searchSource).toHaveBeenCalledWith("bandcamp", "second");
  });
});

describe("playing what a catalogue lists", () => {
  it("plays a hit's match on the source that can, and opens the catalogue's page when nothing is close", async () => {
    await open("?q=get+lucky&source=deezer");
    answerOf("deezer", "get lucky").answer({ ...NOTHING, hits: [hit("Get Lucky", 66609426)] });
    await settle();
    matchOn.mockResolvedValueOnce({ selected: track, candidates: [track] });
    document.querySelector<HTMLElement>(".hit")!.click();
    await settle();
    expect(matchOn).toHaveBeenCalledWith("youtube", expect.objectContaining({ title: "Get Lucky" }));
    expect(player.playTracks).toHaveBeenCalledWith(["ytm:video:v"], 0, [track]);

    invoke.mockResolvedValueOnce(undefined);
    matchOn.mockResolvedValueOnce({ selected: null, candidates: [] });
    document.querySelector<HTMLElement>(".hit")!.click();
    await settle();
    expect(invoke).toHaveBeenLastCalledWith("provider_open", { provider: "deezer", address: "https://www.deezer.com/track/66609426" });
    expect(toasts.show).toHaveBeenCalledWith("No close match. Opened in Deezer.");
    expect(player.playTracks).toHaveBeenCalledTimes(1);
  });

  it("plays a whole show in the catalogue's own embedded player", async () => {
    await open("?q=essential+mix&source=mixcloud");
    answerOf("mixcloud", "essential mix").answer({ ...NOTHING, hits: [{ title: "Essential Mix", artist: "BBC", durationMs: 0, url: "https://www.mixcloud.com/bbc/essential-mix/" }] });
    await settle();
    document.querySelector<HTMLElement>(".hit")!.click();
    flushSync();
    expect(document.querySelector("iframe")?.getAttribute("src")).toBe("https://www.mixcloud.com/widget/iframe/?feed=%2Fbbc%2Fessential-mix%2F&hide_cover=0");
    expect(matchOn).not.toHaveBeenCalled();
  });
});

describe("a pasted Tidal link", () => {
  it("is read from Tidal's public page and offered as its match, without searching the link's text", async () => {
    matchOn.mockResolvedValue({ selected: track, candidates: [track] });
    await open();
    await type(TIDAL);
    await settle();
    expect(searchSource).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith("tidal_shared", { kind: "track", id: "251380837" });
    expect(text()).toContain("Tidal song");
    expect(text()).toContain("Get Lucky");
    button("Play on YouTube Music").click();
    expect(player.playTracks).toHaveBeenCalledWith(["ytm:video:v"], 0, [track]);
    await settle(1500);
    expect(localStorage.getItem("carbon-recent-searches")).toBeNull();
  });

  it("says plainly that an album has no public track list, and offers to search for it", async () => {
    await open();
    await type("https://tidal.com/album/renaissance/251380836");
    await settle();
    expect(text()).toContain("Tidal album");
    expect(text()).toContain("Tidal shares only the name and cover of albums and playlists, not their songs.");
    expect(matchOn).not.toHaveBeenCalled();
    button("Search for it").click();
    await settle(DEBOUNCE_MS);
    expect(input().value).toBe("Get Lucky Daft Punk");
    expect(searchSource).toHaveBeenCalledWith("youtube", "Get Lucky Daft Punk");
  });
});
