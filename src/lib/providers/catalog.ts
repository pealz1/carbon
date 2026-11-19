import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { challengeFor, randomString } from "$lib/pkce";
import type { Raw } from "$lib/soundcloud/shared/listed";
import type { Track } from "$lib/spotify/types";

export type Provider = "apple" | "deezer" | "soundcloud" | "mixcloud" | "archive";
export type Source = Provider | "spotify" | "youtube";
export type Kind = "track" | "album" | "playlist" | "artist";
export interface Link {
  source: Source;
  kind: Kind;
  id: string;
  url: string;
  country: string;
}
export interface Song {
  unavailable?: boolean;
  title: string;
  artist: string;
  durationMs: number;
  image?: string;
  url?: string;
  track?: Track;
}
export interface Collection {
  title: string;
  songs: Song[];
}
export const names: Record<Source, string> = {
  apple: "Apple Music",
  deezer: "Deezer",
  soundcloud: "SoundCloud",
  spotify: "Spotify",
  youtube: "YouTube Music",
  mixcloud: "Mixcloud",
  archive: "Internet Archive",
};
export const homes: Record<Provider, string> = {
  apple: "https://music.apple.com/",
  deezer: "https://www.deezer.com/",
  soundcloud: "https://soundcloud.com/",
  mixcloud: "https://www.mixcloud.com/",
  archive: "https://archive.org/details/audio",
};
const spotifyId = /^[a-zA-Z0-9]{22}$/;
const numberId = /^\d{1,20}$/;
export function parseProviderLink(text: string): Link | null {
  let u: URL;
  try {
    u = new URL(text.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port || u.href.length > 2048) return null;
  const parts = u.pathname.split("/").filter(Boolean);
  const make = (source: Source, kind: Kind, id: string, country = "us"): Link => ({
    source,
    kind,
    id,
    country,
    url: u.href,
  });
  const kinds = ["track", "album", "playlist", "artist"];
  if (u.hostname === "open.spotify.com") {
    if (parts[0]?.startsWith("intl-")) parts.shift();
    return kinds.includes(parts[0]) && spotifyId.test(parts[1] ?? "")
      ? make("spotify", parts[0] as Kind, parts[1])
      : null;
  }
  if (["youtube.com", "www.youtube.com", "music.youtube.com", "m.youtube.com", "youtu.be"].includes(u.hostname)) {
    const list = u.searchParams.get("list"),
      video = u.hostname === "youtu.be" ? parts[0] : u.searchParams.get("v");
    if (list && /^[\w-]{2,128}$/.test(list)) return make("youtube", "playlist", list);
    if (video && /^[\w-]{11}$/.test(video)) return make("youtube", "track", video);
    if (parts[0] === "browse" && /^MPRE[\w-]+$/.test(parts[1] ?? "")) return make("youtube", "album", parts[1]);
    return null;
  }
  if (u.hostname === "music.apple.com") {
    const country = /^[a-z]{2}$/i.test(parts[0] ?? "") ? parts.shift()!.toLowerCase() : "us";
    const kind = parts[0] === "song" ? "track" : parts[0],
      id = parts.at(-1) ?? "",
      song = u.searchParams.get("i");
    if (kind === "album" && song && numberId.test(song)) return make("apple", "track", song, country);
    const valid = kind === "playlist" ? /^pl\.[a-zA-Z0-9-]+$/.test(id) : numberId.test(id);
    return valid && kinds.includes(kind) ? make("apple", kind as Kind, id, country) : null;
  }
  if (["deezer.com", "www.deezer.com"].includes(u.hostname)) {
    if (/^[a-z]{2}(-[a-z]{2})?$/i.test(parts[0] ?? "")) parts.shift();
    return kinds.includes(parts[0]) && numberId.test(parts[1] ?? "")
      ? make("deezer", parts[0] as Kind, parts[1])
      : null;
  }
  if (["soundcloud.com", "www.soundcloud.com"].includes(u.hostname) && parts.length) {
    const kind = parts[1] === "sets" && parts[2] ? "playlist" : parts[1] ? "track" : "artist";
    return make("soundcloud", kind, u.href);
  }
  if (["www.mixcloud.com", "mixcloud.com"].includes(u.hostname) && parts.every((s) => /^[\w.-]{1,200}$/.test(s))) {
    if (parts.length === 2) return make("mixcloud", "track", parts.join("/"));
    if (parts.length === 3 && parts[1] === "playlists") return make("mixcloud", "playlist", parts.join("/"));
  }
  if (
    ["archive.org", "www.archive.org"].includes(u.hostname) &&
    parts[0] === "details" &&
    /^[\w.-]{1,200}$/.test(parts[1] || "")
  )
    return make("archive", "album", parts[1]);
  return null;
}

export async function resolveProviderLink(address: string): Promise<Link | null> {
  const found = parseProviderLink(address);
  if (found) return found;
  if (
    !/^https:\/\/(?:spotify\.(?:app\.)?link|on\.soundcloud\.com|link\.deezer\.com|deezer\.page\.link|deezer\.lnk\.to)\//i.test(
      address.trim(),
    )
  )
    return null;
  return parseProviderLink(await invoke<string>("provider_expand_link", { address: address.trim() }));
}

export function embedUrl(link: Link): string {
  const u = new URL(link.url);
  switch (link.source) {
    case "apple":
      u.hostname = "embed.music.apple.com";
      return u.href;
    case "deezer":
      return `https://widget.deezer.com/widget/dark/${link.kind}/${link.id}`;
    case "soundcloud":
      return (
        "https://w.soundcloud.com/player/?" + new URLSearchParams({ url: u.href, auto_play: "false", visual: "true" })
      );
    case "mixcloud":
      return "https://www.mixcloud.com/widget/iframe/?" + new URLSearchParams({ feed: u.pathname, hide_cover: "0" });
    case "archive":
      return "https://archive.org/embed/" + encodeURIComponent(link.id);
    case "spotify":
      return `https://open.spotify.com/embed/${link.kind}/${link.id}`;
    case "youtube":
      return link.kind === "playlist"
        ? `https://www.youtube.com/embed/videoseries?list=${link.id}`
        : `https://www.youtube.com/embed/${link.id}`;
  }
}
export const openPlayer = (provider: Provider, address = homes[provider]) =>
  invoke<void>("provider_open", { provider, address });
export const connections = () => invoke<{ soundcloud: boolean; soundcloudUser: boolean }>("provider_connections");
export const credentials = (provider: Provider, key: string, secret = "") =>
  invoke<void>("provider_credentials", { provider, key, secret });
export async function connectSoundCloud() {
  const id = await invoke<string>("soundcloud_client_id");
  const verifier = randomString(48),
    state = randomString(32);
  const query = new URLSearchParams({
    client_id: id,
    response_type: "code",
    redirect_uri: "http://127.0.0.1:8888/soundcloud-callback",
    state,
    code_challenge_method: "S256",
    code_challenge: await challengeFor(verifier),
  });
  const [redirect] = await Promise.all([
    invoke<string>("wait_for_soundcloud_redirect"),
    openUrl("https://secure.soundcloud.com/authorize?" + query),
  ]);
  const result = new URLSearchParams(redirect);
  if (result.get("state") !== state || !result.get("code"))
    throw new Error("SoundCloud sign-in was cancelled or expired.");
  await invoke("soundcloud_authorize", { code: result.get("code"), verifier });
}
type Action = Kind | "albumTracks" | "playlistTracks" | "search" | "resolve" | "liked" | "myPlaylists";
const api = (provider: Provider, action: Action, value: string, country = "us", offset = 0) =>
  invoke<Raw>("provider_catalog", { query: { provider, action, value, country, offset } });
export const fromTrack = (track: Track): Song => ({
  title: track.name,
  artist: track.artists.map((a) => a.name).join(", "),
  durationMs: track.durationMs,
  image: track.album?.image ?? undefined,
  track,
});
const entries = (value: unknown): Raw[] =>
  Array.isArray(value) ? value.filter((v) => v && typeof v === "object") : [];
const https = (v: unknown): string | undefined => (typeof v === "string" && /^https:\/\//.test(v) ? v : undefined);
function mapped(provider: Provider, item: Raw): Song | null {
  if (provider === "mixcloud")
    return typeof item.name === "string"
      ? {
          title: item.name,
          artist: item.user?.name || "",
          durationMs: (Number(item.audio_length) || 0) * 1000,
          image: https(item.pictures?.large),
          url: https(item.url),
        }
      : null;
  if (provider === "archive")
    return typeof item.identifier === "string"
      ? {
          title: String(item.title || item.identifier),
          artist: [item.creator || ""].flat().join(", "),
          durationMs: 0,
          image: "https://archive.org/services/img/" + encodeURIComponent(item.identifier),
          url: "https://archive.org/details/" + encodeURIComponent(item.identifier),
        }
      : null;
  if (provider === "apple") {
    const a = item.attributes || item;
    const title = a.trackName || (item.type === "songs" && a.name);
    return typeof title === "string"
      ? {
          title,
          artist: a.artistName || "",
          durationMs: a.trackTimeMillis || a.durationInMillis || 0,
          image: https(a.artworkUrl100 || a.artwork?.url?.replace("{w}", "300").replace("{h}", "300")),
          url: https(a.trackViewUrl || a.url),
        }
      : null;
  }
  if (provider === "deezer")
    return typeof item.title === "string"
      ? {
          title: item.title,
          artist: item.artist?.name || "",
          durationMs: Number(item.duration || 0) * 1000,
          image: https(item.album?.cover_medium),
          url:
            https(item.link) ||
            (numberId.test(String(item.id)) ? `https://www.deezer.com/track/${item.id}` : undefined),
        }
      : null;
  const s = item.track || item;
  return typeof s.title === "string"
    ? {
        title: s.title,
        artist: s.publisher_metadata?.artist || s.user?.username || "",
        durationMs: s.duration || 0,
        image: https(s.artwork_url || s.user?.avatar_url),
        url: https(s.permalink_url),
      }
    : null;
}
const songsOf = (provider: Provider, items: unknown): Song[] =>
  entries(items).flatMap((item) => mapped(provider, item) ?? []);
export async function searchCatalog(provider: Provider, term: string, country?: string): Promise<Song[]> {
  const r = await api(provider, "search", term, country);
  return songsOf(provider, r.results || r.data || r.collection || r.response?.docs || r);
}
export const scLikes = async () => {
  const r = await api("soundcloud", "liked", "");
  return songsOf("soundcloud", r.collection || r);
};
export const scPlaylists = async () => {
  const r = await api("soundcloud", "myPlaylists", "");
  return entries(r.collection || r)
    .map((p) => ({ title: String(p.title), url: https(p.permalink_url) }))
    .filter((p) => p.url);
};

export async function providerCollection(link: Link, signal?: AbortSignal): Promise<Collection> {
  const provider = link.source;
  if (provider === "youtube" || provider === "spotify")
    throw new Error("Use the connected music service for this link.");
  if (provider === "soundcloud" && !(await connections().catch(() => null))?.soundcloud) {
    return (await import("./widget")).soundcloudWidget(link.url, signal);
  }
  const raw = await api(provider, provider === "soundcloud" ? "resolve" : link.kind, link.id, link.country);
  if (provider === "archive") {
    if (raw.is_dark || raw.metadata?.["access-restricted-item"] === "true")
      throw new Error("This archive item has restricted access.");
    const tracks = new Map<string, Song>();
    for (const f of entries(raw.files)) {
      if (f.private || !/\.(flac|mp3|ogg|m4a|wav|shn)$/i.test(f.name || "")) continue;
      const key = f.original || f.name,
        duration = String(f.length || 0)
          .split(":")
          .reduce((n, s) => n * 60 + Number(s), 0);
      if (!tracks.has(key))
        tracks.set(key, {
          title: f.title || String(key).replace(/\.[^.]+$/, ""),
          artist: [f.artist || raw.metadata?.creator || ""].flat().join(", "),
          durationMs: duration * 1000,
        });
    }
    return { title: String(raw.metadata?.title || link.id), songs: [...tracks.values()] };
  }
  const base = raw;
  if (!base) throw new Error("This collection is unavailable.");
  let title = base.name || base.title || raw.results?.[0]?.collectionName || names[provider];
  if (provider === "mixcloud" && link.kind === "playlist")
    title = link.id.split("/").at(-1)?.replaceAll("-", " ") || title;
  if (provider === "deezer" && (link.kind === "album" || link.kind === "playlist")) {
    base.tracks = await api(provider, link.kind === "album" ? "albumTracks" : "playlistTracks", link.id, link.country);
  }
  if (provider === "soundcloud" && link.kind === "playlist" && base.id) {
    const trackPage = await api(provider, "playlistTracks", String(base.id), link.country, 0);
    // The playlist's track endpoint returns complete records instead of ID-only stubs.
    if (trackPage.collection || Array.isArray(trackPage)) base.tracks = trackPage;
  }
  if (link.kind === "track") {
    const songs = songsOf(provider, raw.results || [base]);
    return { title: songs[0]?.title || title, songs };
  }
  let page = base.tracks || base;
  let items = raw.results || page.data || page.collection || (Array.isArray(page) ? page : []);
  const songs = songsOf(provider, items);
  let next = page.next || page.next_href || page.paging?.next,
    count = items.length;
  const seen = new Set<string>();
  while (next) {
    signal?.throwIfAborted();
    if (seen.has(next) || count >= 10_000)
      throw new Error("This collection is too large or its page repeated. Import a smaller selection.");
    seen.add(next);
    page = await invoke<Raw>("provider_page", { provider, address: next, country: link.country });
    items = page.data || page.collection || (Array.isArray(page) ? page : []);
    count += items.length;
    songs.push(...songsOf(provider, items));
    next = page.next || page.next_href || page.paging?.next;
  }
  if (count > 10_000) throw new Error("Carbon playlists hold up to 10,000 songs.");
  if (provider === "soundcloud" && count && songs.length < count)
    throw new Error("SoundCloud did not share the full set. Open its public player or import an exported list.");
  return { title, songs };
}
