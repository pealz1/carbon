import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, backoffMs, get, NetworkError, onApiNotice, retryAfterMs, send, useTokenSource, type ApiNotice } from "./api";

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? "" : JSON.stringify(body), { status, headers });

describe("retryAfterMs", () => {
  it("reads seconds and caps them", () => {
    expect(retryAfterMs("2")).toBe(2000);
    expect(retryAfterMs("0")).toBe(0);
    expect(retryAfterMs("999", 30_000)).toBe(30_000);
  });

  it("falls back to a default for missing or junk headers", () => {
    expect(retryAfterMs(null)).toBe(1000);
    expect(retryAfterMs("soon")).toBe(1000);
    expect(retryAfterMs("-3")).toBe(1000);
  });
});

describe("request handling", () => {
  const fetchMock = vi.fn();
  const tokens = { get: vi.fn(async () => "old"), refresh: vi.fn(async () => "new") };

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    useTokenSource(tokens);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    tokens.get.mockClear();
    tokens.refresh.mockClear();
  });

  it("refreshes once on 401 and retries with the new token", async () => {
    fetchMock.mockResolvedValueOnce(json(401, {})).mockResolvedValueOnce(json(200, { id: "me" }));
    await expect(get("/me-401")).resolves.toEqual({ id: "me" });
    expect(tokens.refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer new");
  });

  it("waits out 429s, then succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(json(429, {}, { "Retry-After": "0" }))
      .mockResolvedValueOnce(json(200, { ok: true }));
    await expect(get("/limited")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces API errors with status and message", async () => {
    fetchMock.mockResolvedValue(json(403, { error: { status: 403, message: "Premium required" } }));
    const error = await get("/forbidden").catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403, message: "Premium required" });
  });

  it("caches GETs and shares in-flight requests", async () => {
    fetchMock.mockResolvedValue(json(200, { n: 1 }));
    const [a, b] = await Promise.all([get("/cached"), get("/cached")]);
    await get("/cached");
    expect(a).toEqual(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends JSON bodies and tolerates empty 204 responses", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(send("PUT", "/me/player/play", { uris: ["x"] })).resolves.toBeNull();
    const [, init] = fetchMock.mock.calls[0];
    expect(init).toMatchObject({ method: "PUT", body: '{"uris":["x"]}' });
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("refuses to call the API when signed out", async () => {
    useTokenSource(null);
    await expect(get("/me")).rejects.toMatchObject({ status: 401 });
  });

  it("reads Spotify's machine-readable reason", async () => {
    fetchMock.mockResolvedValue(json(403, { error: { status: 403, message: "Player command failed: Premium required", reason: "PREMIUM_REQUIRED" } }));
    await expect(send("PUT", "/me/player/play")).rejects.toMatchObject({ status: 403, reason: "PREMIUM_REQUIRED" });
  });
});

describe("recovery bounds", () => {
  const fetchMock = vi.fn();
  const notices: ApiNotice[] = [];
  const tokens = { get: vi.fn(async () => "old"), refresh: vi.fn(async () => "new") };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", fetchMock);
    useTokenSource(tokens);
    onApiNotice((n) => notices.push(n));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    tokens.refresh.mockReset().mockResolvedValue("new");
    notices.length = 0;
    onApiNotice(null);
  });

  /** Runs a request to completion, letting every backoff timer fire. */
  async function settle<T>(promise: Promise<T>): Promise<T | unknown> {
    const outcome = promise.catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    return outcome;
  }

  it("backs off from 5xx answers and retries at most twice", async () => {
    fetchMock.mockImplementation(async () => json(503, { error: { message: "Service unavailable" } }));
    const error = await settle(get("/flaky"));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(error).toMatchObject({ status: 503, retries: 2 });
    expect(notices).toEqual([
      { kind: "retrying", cause: "server", waitMs: backoffMs(0) },
      { kind: "retrying", cause: "server", waitMs: backoffMs(1) },
    ]);
    expect(backoffMs(1)).toBe(2 * backoffMs(0));
  });

  it("recovers when a retry gets through", async () => {
    fetchMock.mockResolvedValueOnce(json(502, {})).mockResolvedValueOnce(json(200, { ok: true }));
    await expect(settle(send("PUT", "/me/player/play"))).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries network failures twice, then reports them as such", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const error = await settle(get("/offline"));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(error).toBeInstanceOf(NetworkError);
    expect(error).toMatchObject({ retries: 2 });
    expect(notices.map((n) => n.kind === "retrying" && n.cause)).toEqual(["network", "network"]);
  });

  it("never resends a POST after a server or network failure", async () => {
    fetchMock.mockResolvedValueOnce(json(502, {}));
    expect(await settle(send("POST", "/me/player/queue?uri=x"))).toMatchObject({ status: 502, retries: 0 });
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await settle(send("POST", "/me/player/queue?uri=x"))).toBeInstanceOf(NetworkError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(notices).toEqual([]);
  });

  it("stops after two rate-limit waits and says how long it waited", async () => {
    fetchMock.mockImplementation(async () => json(429, {}, { "Retry-After": "3" }));
    expect(await settle(get("/limited-hard"))).toMatchObject({ status: 429, retries: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(notices).toEqual([
      { kind: "retrying", cause: "rate-limit", waitMs: 3000 },
      { kind: "retrying", cause: "rate-limit", waitMs: 3000 },
    ]);
  });

  it("refreshes once on 401, then asks to sign in", async () => {
    fetchMock.mockImplementation(async () => json(401, { error: { message: "The access token expired" } }));
    expect(await settle(get("/still-401"))).toMatchObject({ status: 401 });
    expect(tokens.refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(notices).toEqual([{ kind: "auth-lost" }]);
  });

  it("treats a revoked refresh token as signed out", async () => {
    fetchMock.mockResolvedValue(json(401, {}));
    tokens.refresh.mockRejectedValue(new ApiError(400, "Refresh token revoked"));
    expect(await settle(get("/revoked"))).toMatchObject({ status: 401 });
    expect(notices).toEqual([{ kind: "auth-lost" }]);
  });

  it("flags a missing permission so the sign-in banner can show", async () => {
    fetchMock.mockResolvedValue(json(403, { error: { message: "Insufficient client scope" } }));
    expect(await settle(send("PUT", "/playlists/p"))).toMatchObject({ status: 403 });
    expect(notices).toEqual([{ kind: "scope-missing" }]);
  });
});
