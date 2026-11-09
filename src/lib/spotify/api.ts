// Thin Spotify Web API client: bearer auth, one refresh on 401, Retry-After on 429,
// in-flight de-duplication and a short-lived GET cache (dev-mode apps are rate limited hard).
import { SPOTIFY, TIMING } from "$lib/config";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
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

export function retryAfterMs(header: string | null, max: number = TIMING.maxRetryAfterMs): number {
  const seconds = header === null ? NaN : Number(header);
  if (!Number.isFinite(seconds) || seconds < 0) return DEFAULT_RETRY_MS;
  return Math.min(seconds * 1000, max);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body?.error?.message ?? body?.error_description ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

async function request(method: string, path: string, body?: unknown, attempt = 0, refreshed = false): Promise<Response> {
  if (!tokens) throw new ApiError(401, "Not signed in");
  const token = refreshed ? await tokens.refresh() : await tokens.get();
  const res = await fetch(path.startsWith("https://") ? path : `${SPOTIFY.apiUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body !== undefined && { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && !refreshed) return request(method, path, body, attempt, true);
  if (res.status === 429 && attempt < TIMING.maxRateLimitRetries) {
    await sleep(retryAfterMs(res.headers.get("Retry-After")));
    return request(method, path, body, attempt + 1, refreshed);
  }
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
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

export async function send<T = unknown>(method: "PUT" | "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
  return parse<T>(await request(method, path, body));
}
