import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { challengeFor, randomString } from "$lib/pkce";

export const REDIRECT_URI = "http://127.0.0.1:8888/tidal-callback";
export const DEVELOPER_PORTAL = "https://developer.tidal.com/";
const SCOPES = "search.read collection.read playlists.read playlists.write";
const ORIGIN = "https://openapi.tidal.com";

export type Kind = "track" | "album" | "artist" | "playlist";
export type Operation =
  | { kind: "search"; query: string }
  | { kind: "ownedPlaylists" | "savedPlaylists" | "savedTracks" }
  | { kind: "playlistTracks" | "albumTracks" | "artistAlbums"; id: string };

interface Identifier {
  id?: string;
  type?: string;
  meta?: { itemId?: string };
}
interface Resource extends Identifier {
  attributes?: { title?: string; name?: string; files?: { href?: string }[] };
  relationships?: Record<string, { data?: Identifier[] | Identifier }>;
}
interface Document {
  data?: Resource[] | Resource;
  included?: Resource[];
  links?: { next?: string | { href?: string } | null };
}

export interface Row {
  kind: Kind;
  id: string;
  title: string;
  artist: string;
  image: string | null;
  itemId: string | null;
}
export interface Page {
  rows: Row[];
  cursor: string | null;
}

const types = { tracks: "track", albums: "album", playlists: "playlist", artists: "artist" } as const;
const list = <T>(value: T[] | T | undefined): T[] => Array.isArray(value) ? value.filter(Boolean) : value ? [value] : [];
const key = (value: Identifier) => `${value.type}:${value.id}`;
const relation = (resource: Resource | undefined, name: string): Identifier[] =>
  list(resource?.relationships?.[name]?.data);

function imageUrl(candidate: unknown): string | null {
  if (typeof candidate !== "string") return null;
  try {
    const url = new URL(candidate);
    if (url.protocol === "https:" && !url.username && !url.password && !url.port && url.hostname === "resources.tidal.com") return url.href;
  } catch { /* malformed artwork can use the placeholder */ }
  return null;
}

export function validId(kind: Kind, id: string): boolean {
  return kind === "playlist"
    ? /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id)
    : /^\d{1,20}$/.test(id);
}

export const shareUrl = ({ kind, id }: Pick<Row, "kind" | "id">) => `https://tidal.com/browse/${kind}/${id}`;
export const playerUrl = ({ kind, id }: Pick<Row, "kind" | "id">) => `https://embed.tidal.com/${kind}s/${id}`;

function nextPage(next: NonNullable<Document["links"]>["next"]): string | null {
  const href = typeof next === "string" ? next : next?.href;
  if (!href) return null;
  try {
    const url = new URL(href, ORIGIN);
    const cursor = url.searchParams.get("page[cursor]");
    return url.origin === ORIGIN && cursor && cursor.length <= 2048 ? cursor : null;
  } catch { return null; }
}

/** Resolve JSON:API relationship rows without losing the order or copies of a track. */
export function mapPage(document: Document | null): Page {
  const primary = list(document?.data);
  const included = list(document?.included);
  const resources = new Map([...included, ...primary.filter((row) => row.attributes)].map((row) => [key(row), row]));
  const read = (ids: Identifier[]) => ids.map((ref) => resources.get(key(ref))).filter((x): x is Resource => !!x);
  const results = primary[0]?.type === "searchResults"
    ? Object.keys(types).flatMap((type) => relation(primary[0], type))
    : primary;
  const rows = results.flatMap((ref): Row[] => {
    const type = ref.type;
    if (type !== "tracks" && type !== "albums" && type !== "playlists" && type !== "artists") return [];
    const kind = types[type];
    const resource = resources.get(key(ref));
    const title = resource?.attributes?.title ?? resource?.attributes?.name;
    if (typeof title !== "string" || !title.trim() || typeof ref.id !== "string" || !validId(kind, ref.id)) return [];
    const artist = read(relation(resource, "artists")).map((row) => row.attributes?.name).filter((x): x is string => typeof x === "string").join(", ");
    const album = kind === "track" ? read(relation(resource, "albums"))[0] : resource;
    const cover = read(relation(album, kind === "artist" ? "profileArt" : "coverArt"))
      .flatMap((row) => list(row.attributes?.files)).map((file) => imageUrl(file.href)).find(Boolean) ?? null;
    return [{ kind, id: ref.id, title, artist, image: cover, itemId: typeof ref.meta?.itemId === "string" ? ref.meta.itemId : null }];
  });
  return { rows, cursor: nextPage(document?.links?.next) };
}

export const connected = () => invoke<boolean>("tidal_connected");
export const disconnect = () => invoke<void>("tidal_disconnect");

export async function connect(clientId: string): Promise<void> {
  const verifier = randomString(48);
  const state = randomString(32);
  const url = new URL("https://login.tidal.com/authorize");
  url.search = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    state,
    code_challenge: await challengeFor(verifier),
    code_challenge_method: "S256",
  }).toString();
  const waiting = invoke<string>("wait_for_tidal_redirect");
  // Attach a handler even if the system couldn't open the browser.
  void waiting.catch(() => {});
  await openUrl(url.href);
  const query = new URLSearchParams(await waiting);
  const code = query.get("code");
  if (query.get("state") !== state || query.has("error") || !code) throw new Error("TIDAL sign-in was cancelled or expired.");
  await invoke<void>("tidal_authorize", { clientId, code, verifier });
}

export async function read(operation: Operation, cursor: string | null = null): Promise<Page> {
  return mapPage(await invoke<Document>("tidal_read", { operation, cursor }));
}

export async function createPlaylist(name: string): Promise<Row | null> {
  const result = await invoke<Document>("tidal_create_playlist", { name });
  return mapPage(result).rows[0] ?? null;
}

export function editPlaylistTrack(playlist: string, track: string, itemId: string | null = null): Promise<void> {
  return invoke("tidal_edit_playlist_track", { playlist, track, itemId });
}
