import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, get, retryAfterMs, send, useTokenSource } from "./api";

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
});
