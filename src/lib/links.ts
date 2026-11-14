// A pasted Spotify or YouTube Music link (or a spotify: URI) as something Carbon can open or play,
// so a link from a friend goes straight into the command palette instead of a browser.
export type LinkService = "spotify" | "youtube";

export interface LinkTarget {
  service: LinkService;
  /** What the link points at, as the listener would say it. */
  what: "song" | "album" | "artist" | "playlist" | "podcast" | "episode";
  /** A page in Carbon, for things that are browsed. */
  href?: string;
  /** Something to play, for songs and episodes. */
  playUri?: string;
}

const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const YOUTUBE_VIDEO = /^[\w-]{11}$/;
const YOUTUBE_ID = /^[\w-]{2,128}$/;
const SPOTIFY_KINDS = { track: "song", album: "album", artist: "artist", playlist: "playlist", show: "podcast", episode: "episode" } as const;
type SpotifyKind = keyof typeof SPOTIFY_KINDS;
const YOUTUBE_HOSTS = new Set(["music.youtube.com", "www.youtube.com", "youtube.com", "m.youtube.com"]);

function spotify(kind: string, id: string): LinkTarget | null {
  if (!(kind in SPOTIFY_KINDS) || !SPOTIFY_ID.test(id)) return null;
  const what = SPOTIFY_KINDS[kind as SpotifyKind];
  const plays = kind === "track" || kind === "episode";
  return { service: "spotify", what, ...(plays ? { playUri: `spotify:${kind}:${id}` } : { href: `/${kind}/${id}` }) };
}

const video = (id: string | null): LinkTarget | null =>
  id && YOUTUBE_VIDEO.test(id) ? { service: "youtube", what: "song", playUri: `ytm:video:${id}` } : null;

function youtube(url: URL): LinkTarget | null {
  if (url.hostname === "youtu.be") return video(url.pathname.slice(1));
  if (!YOUTUBE_HOSTS.has(url.hostname)) return null;
  const [, section, id = ""] = url.pathname.split("/");
  const page = (what: "album" | "artist" | "playlist", value: string | null): LinkTarget | null =>
    value && YOUTUBE_ID.test(value) ? { service: "youtube", what, href: `/youtube/${what}/${encodeURIComponent(value)}` } : null;
  if (section === "watch") return video(url.searchParams.get("v"));
  if (section === "playlist") return page("playlist", url.searchParams.get("list"));
  if (section === "channel") return page("artist", id);
  if (section === "browse") return id.startsWith("MPRE") ? page("album", id) : id.startsWith("UC") ? page("artist", id) : null;
  return null;
}

/** What `text` links to, or null when it isn't a Spotify or YouTube Music link Carbon can open. */
export function parseLink(text: string): LinkTarget | null {
  const value = text.trim();
  const uri = /^spotify:(\w+):(\w+)$/.exec(value);
  if (uri) return spotify(uri[1], uri[2]);
  if (!/^https?:\/\//i.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.hostname !== "open.spotify.com") return youtube(url);
  // Shared links carry a locale first: open.spotify.com/intl-de/track/…
  const parts = url.pathname.split("/").filter((part) => part && !part.startsWith("intl-"));
  return spotify(parts[0] ?? "", parts[1] ?? "");
}
