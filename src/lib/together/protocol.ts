// Listen together: the room protocol (cloud/API.md, "Rooms"), version 1. Everything the relay
// sends is checked here before the app acts on it; the relay checks what Carbon sends just as hard.
export const PROTOCOL_VERSION = 1;
export const CODE_LENGTH = 6;
/** No 0/O, 1/I/L: a code is read aloud and typed by hand. */
const CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const HOST_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export const MAX_NAME = 32;
const MAX_TITLE = 200;
const MAX_ARTIST = 100;
const MAX_ARTISTS = 10;
const MAX_TRACK_MS = 24 * 60 * 60_000;
const MAX_MEMBERS = 50;
const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

/** Close codes the relay uses (cloud/src/rooms/protocol.ts). */
export const CLOSE = { ended: 4001, replaced: 4002, full: 4005 } as const;

export type Service = "spotify" | "youtube";
export const SERVICE_NAMES: Record<Service, string> = { spotify: "Spotify", youtube: "YouTube Music" };

/**
 * The service every listener needs to play `uri` from their own account, or null when the song
 * can't be shared at all (local files, radio, a personal server, podcasts, whole albums).
 */
export function serviceOf(uri: string | null | undefined): Service | null {
  if (!uri) return null;
  if (/^spotify:track:[0-9A-Za-z]{22}$/.test(uri)) return "spotify";
  return /^ytm:video:[A-Za-z0-9_-]{11}$/.test(uri) ? "youtube" : null;
}

/** What the host is playing and where they were in it at `sentAt` (the relay's clock). */
export interface HostState {
  /** null: something that can't be shared. */
  uri: string | null;
  title: string;
  artists: string[];
  durationMs: number;
  positionMs: number;
  paused: boolean;
  rate: number;
  sentAt: number;
}

export type Role = "host" | "guest";
export type CloseReason = "ended" | "host_left" | "expired";

export type ServerMessage =
  | { type: "welcome"; role: Role; hostName: string | null; members: number; state: HostState | null }
  | { type: "state"; state: HostState }
  | { type: "members"; count: number }
  | { type: "pong"; t: number; now: number }
  | { type: "closed"; reason: CloseReason }
  | { type: "error"; code: string; message: string };

export type ClientMessage = { type: "hello"; token?: string } | { type: "ping"; t: number } | ({ type: "state" } & HostState) | { type: "end" };

export const encode = (message: ClientMessage): string => JSON.stringify({ v: PROTOCOL_VERSION, ...message });

type Fields = Record<string, unknown>;
const isText = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max;
const isWhole = (value: unknown, max: number): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= max;
const isName = (value: unknown): value is string | null => value === null || (isText(value, MAX_NAME) && value.length > 0);

function parseState(raw: Fields): HostState | null {
  const { uri, title, artists, durationMs, positionMs, paused, rate, sentAt } = raw;
  if (uri !== null && (typeof uri !== "string" || !serviceOf(uri))) return null;
  if (!isText(title, MAX_TITLE) || !Array.isArray(artists) || artists.length > MAX_ARTISTS || !artists.every((a) => isText(a, MAX_ARTIST))) return null;
  if (!isWhole(durationMs, MAX_TRACK_MS) || !isWhole(positionMs, MAX_TRACK_MS) || typeof paused !== "boolean") return null;
  if (!RATES.includes(rate as number) || !isWhole(sentAt, Number.MAX_SAFE_INTEGER)) return null;
  return { uri, title, artists: artists as string[], durationMs, positionMs, paused, rate: rate as number, sentAt };
}

function parseWelcome(raw: Fields): ServerMessage | null {
  const { role, hostName, members, state } = raw;
  if ((role !== "host" && role !== "guest") || !isName(hostName) || !isWhole(members, MAX_MEMBERS)) return null;
  const parsed = state === null ? null : typeof state === "object" ? parseState(state as Fields) : null;
  if (state !== null && !parsed) return null;
  return { type: "welcome", role, hostName, members, state: parsed };
}

function parseFields(raw: Fields): ServerMessage | null {
  switch (raw.type) {
    case "welcome":
      return parseWelcome(raw);
    case "state": {
      const state = parseState(raw);
      return state && { type: "state", state };
    }
    case "members":
      return isWhole(raw.count, MAX_MEMBERS) ? { type: "members", count: raw.count } : null;
    case "pong":
      return Number.isFinite(raw.t) && isWhole(raw.now, Number.MAX_SAFE_INTEGER) ? { type: "pong", t: raw.t as number, now: raw.now } : null;
    case "closed":
      return raw.reason === "ended" || raw.reason === "host_left" || raw.reason === "expired" ? { type: "closed", reason: raw.reason } : null;
    case "error":
      return isText(raw.code, 64) && isText(raw.message, 300) ? { type: "error", code: raw.code, message: raw.message } : null;
    default:
      return null;
  }
}

/** A message from the relay, or null when it isn't a well-formed one of this protocol version. */
export function parseServerMessage(data: unknown): ServerMessage | null {
  if (typeof data !== "string") return null;
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null || (raw as Fields).v !== PROTOCOL_VERSION) return null;
  return parseFields(raw as Fields);
}

/** A typed or pasted room code ("abc-def", " abcdef ") as the relay knows it, or null. */
export function normalizeCode(text: string): string | null {
  const code = text.replace(/[\s-]/g, "").toUpperCase();
  return CODE.test(code) ? code : null;
}

export const isHostToken = (value: unknown): value is string => typeof value === "string" && HOST_TOKEN.test(value);
