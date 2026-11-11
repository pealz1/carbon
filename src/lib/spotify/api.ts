// Thin Spotify Web API client: bearer auth, one refresh on 401, Retry-After on 429, bounded
// backoff on 5xx/network failures, in-flight de-duplication and a short-lived GET cache
// (dev-mode apps are rate limited hard).
import { SPOTIFY, TIMING } from "$lib/config";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Spotify's machine-readable `error.reason` (player endpoints), e.g. PREMIUM_REQUIRED. */
    readonly reason: string | null = null,
    /** How many times Carbon retried before giving up. */
    readonly retries = 0,
  ) {
    super(message);
  }
}

/** The request never got an answer (offline, DNS, TLS, connection reset). */
export class NetworkError extends Error {
  constructor(
    readonly retries: number,
    cause: unknown,
  ) {
    super("Can't reach Spotify", { cause });
  }
}

export interface TokenSource {
  get(): Promise<string>;
  refresh(): Promise<string>;
}

/** What the client is doing on its own, so the interface can tell the listener. */
export type ApiNotice =
  | { kind: "retrying"; cause: "rate-limit" | "server" | "network"; waitMs: number }
  | { kind: "auth-lost" }
  | { kind: "scope-missing" };

const MAX_CACHE_ENTRIES = 200;
const DEFAULT_RETRY_MS = 1000;

let tokens: TokenSource | null = null;
let notify: (notice: ApiNotice) => void = () => {};
const cache = new Map<string, { expires: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

export function useTokenSource(source: TokenSource | null): void {
  tokens = source;
  cache.clear();
}

export function onApiNotice(listener: ((notice: ApiNotice) => void) | null): void {
  notify = listener ?? (() => {});
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

/** Wait before retry `attempt` (0-based) after a 5xx or network failure: 0.5 s, then 1 s. */
export const backoffMs = (attempt: number): number => TIMING.retryBaseMs * 2 ** attempt;

// A POST that failed in transit may still have worked; retrying could queue a song or create a playlist twice.
const canRetry = (method: string, attempt: number) => method !== "POST" && attempt < TIMING.maxRetries;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function wait(cause: "rate-limit" | "server" | "network", waitMs: number): Promise<void> {
  notify({ kind: "retrying", cause, waitMs });
  await sleep(waitMs);
}

async function apiError(res: Response, retries: number): Promise<ApiError> {
  try {
    const body = await res.json();
    const reason = typeof body?.error?.reason === "string" ? body.error.reason : null;
    return new ApiError(res.status, body?.error?.message ?? body?.error_description ?? res.statusText, reason, retries);
  } catch {
    return new ApiError(res.status, res.statusText, null, retries);
  }
}

async function bearer(source: TokenSource, refreshed: boolean): Promise<string> {
  try {
    return await (refreshed ? source.refresh() : source.get());
  } catch (e) {
    // The refresh token was revoked or expired: only signing in again helps.
    if (!(e instanceof ApiError && (e.status === 400 || e.status === 401))) throw e;
    notify({ kind: "auth-lost" });
    throw new ApiError(401, e.message);
  }
}

interface Payload {
  body: string;
  type: string;
}

/** `refreshed`: a 401 already cost one refresh; `refreshNow`: this attempt is the one that refreshes. */
async function request(method: string, path: string, payload?: Payload, attempt = 0, refreshed = false, refreshNow = false): Promise<Response> {
  if (!tokens) throw new ApiError(401, "Not signed in");
  const token = await bearer(tokens, refreshNow);
  const again = () => request(method, path, payload, attempt + 1, refreshed);
  let res: Response;
  try {
    res = await fetch(path.startsWith("https://") ? path : `${SPOTIFY.apiUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(payload && { "Content-Type": payload.type }) },
      body: payload?.body,
    });
  } catch (e) {
    if (!canRetry(method, attempt)) throw new NetworkError(attempt, e);
    return wait("network", backoffMs(attempt)).then(again);
  }
  if (res.status === 401 && !refreshed) return request(method, path, payload, attempt, true, true);
  // Spotify didn't process a rate-limited request, so even a POST is safe to send again.
  if (res.status === 429 && attempt < TIMING.maxRetries) return wait("rate-limit", retryAfterMs(res.headers.get("Retry-After"))).then(again);
  if (res.status >= 500 && canRetry(method, attempt)) return wait("server", backoffMs(attempt)).then(again);
  if (res.ok) return res;
  const error = await apiError(res, attempt);
  if (error.status === 401) notify({ kind: "auth-lost" });
  if (error.status === 403 && /scope/i.test(error.message)) notify({ kind: "scope-missing" });
  throw error;
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
