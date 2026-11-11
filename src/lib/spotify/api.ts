// Thin Spotify Web API client: bearer auth, one refresh on 401, Retry-After on 429,
// in-flight de-duplication and a short-lived GET cache (dev-mode apps are rate limited hard).
import { SPOTIFY, TIMING } from "$lib/config";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Spotify's machine-readable `error.reason` (player endpoints), e.g. PREMIUM_REQUIRED. */
    readonly reason: string | null = null,
  ) {
    super(message);
  }
}

export interface TokenSource {
  get(): Promise<string>;
  refresh(): Promise<string>;
}

const MAX_CACHE_ENTRIES = 200;
const DEFAULT_RETRY_MS = 1000;

let tokens: TokenSource | null = null;
const cache = new Map<string, { expires: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

export function useTokenSource(source: TokenSource | null): void {
  tokens = source;
  cache.clear();
}

export const clearCache = (): void => cache.clear();

/** Drops cached GETs whose path starts with any prefix, so views re-read after a write. */
export function invalidate(...prefixes: string[]): void {
  for (const key of [...cache.keys()]) if (prefixes.some((p) => key.startsWith(p))) cache.delete(key);
}

export function retryAfterMs(header: string | null, max: number = TIMING.maxRetryAfterMs): number {
  const seconds = header === null ? NaN : Number(header);
  if (!Number.isFinite(seconds) || seconds < 0) return DEFAULT_RETRY_MS;
  return Math.min(seconds * 1000, max);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function apiError(res: Response): Promise<ApiError> {
  try {
    const body = await res.json();
    const reason = typeof body?.error?.reason === "string" ? body.error.reason : null;
    return new ApiError(res.status, body?.error?.message ?? body?.error_description ?? res.statusText, reason);
  } catch {
    return new ApiError(res.status, res.statusText);
  }
}

interface Payload {
  body: string;
  type: string;
}

async function request(method: string, path: string, payload?: Payload, attempt = 0, refreshed = false): Promise<Response> {
  if (!tokens) throw new ApiError(401, "Not signed in");
  const token = refreshed ? await tokens.refresh() : await tokens.get();
  const res = await fetch(path.startsWith("https://") ? path : `${SPOTIFY.apiUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(payload && { "Content-Type": payload.type }) },
    body: payload?.body,
  });
  if (res.status === 401 && !refreshed) return request(method, path, payload, attempt, true);
  if (res.status === 429 && attempt < TIMING.maxRateLimitRetries) {
    await sleep(retryAfterMs(res.headers.get("Retry-After")));
    return request(method, path, payload, attempt + 1, refreshed);
  }
  if (!res.ok) throw await apiError(res);
  return res;
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export function get<T>(path: string, ttlMs: number = TIMING.apiCacheTtlMs): Promise<T> {
  const hit = cache.get(path);
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.data as T);
  const pending = inflight.get(path);
  if (pending) return pending as Promise<T>;
  const promise = request("GET", path)
    .then((res) => parse<T>(res))
    .then((data) => {
      if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
      cache.set(path, { expires: Date.now() + ttlMs, data });
      return data;
    })
    .finally(() => inflight.delete(path));
  inflight.set(path, promise);
  return promise;
}

/** Uncached GET for live state (player, queue, library checks). Empty 204 bodies become null. */
export async function getFresh<T>(path: string): Promise<T> {
  return parse<T>(await request("GET", path));
}

type Method = "PUT" | "POST" | "DELETE";

export async function send<T = unknown>(method: Method, path: string, body?: unknown): Promise<T> {
  return parse<T>(await request(method, path, body === undefined ? undefined : { body: JSON.stringify(body), type: "application/json" }));
}

/** Sends a non-JSON body as-is (playlist covers are base64 JPEG text). */
export async function sendRaw<T = unknown>(method: Method, path: string, body: string, type: string): Promise<T> {
  return parse<T>(await request(method, path, { body, type }));
}
