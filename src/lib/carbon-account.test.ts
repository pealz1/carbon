import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const openUrl = vi.fn(async (_url: string) => {});
vi.mock("@tauri-apps/api/core", () => ({ invoke: (cmd: string, args?: unknown) => invoke(cmd, args) }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: (url: string) => openUrl(url) }));

const { CarbonError, describeCarbonError, exchangeCode, fetchMe, loginUrl, logout, parseUser } = await import("./carbon-account");
const { account } = await import("./account.svelte");

const user = { id: "u1", email: "me@example.com", plan: "free", createdAt: "2026-11-01T00:00:00Z" };
const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status });

describe("carbon accounts API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("builds the app-login link for the loopback receiver", () => {
    const url = new URL(loginUrl("st", "ch"));
    expect(url.origin + url.pathname).toBe("https://getcarbon.cc/app-login");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      redirect_uri: "http://127.0.0.1:8888/carbon-callback",
      state: "st",
      code_challenge: "ch",
      code_challenge_method: "S256",
    });
  });

  it("validates users", () => {
    expect(parseUser(user)).toEqual(user);
    expect(() => parseUser({ ...user, email: "nope" })).toThrow(CarbonError);
    expect(() => parseUser({ ...user, plan: 3 })).toThrow(/unexpected/);
    expect(() => parseUser(null)).toThrow();
  });

  it("exchanges a code for a token with the verifier", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => json(200, { token: "tok", user }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await exchangeCode("c", "v")).toEqual({ token: "tok", user });
    const [input, init] = fetchMock.mock.calls[0];
    expect(String(input)).toBe("https://api.getcarbon.cc/v1/app/token");
    expect(JSON.parse(String(init?.body))).toEqual({ code: "c", code_verifier: "v" });
    vi.stubGlobal("fetch", vi.fn(async () => json(200, { token: "has space", user })));
    await expect(exchangeCode("c", "v")).rejects.toThrow(/unexpected/);
  });

  it("reads the profile and signs out with the bearer token", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) =>
      String(input).endsWith("/v1/me") ? json(200, { user, sessions: [] }) : json(204),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchMe("tok")).toEqual(user);
    await logout("tok");
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(fetchMock.mock.calls[1][1]?.method).toBe("POST");
  });

  it("turns error envelopes into plain sentences", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(400, { error: { code: "invalid_code", message: "That code has expired." } })));
    const error = await exchangeCode("c", "v").catch((e) => e);
    expect(error).toMatchObject({ status: 400, code: "invalid_code" });
    expect(describeCarbonError(error)).toBe("That code has expired.");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 502 })));
    expect(await fetchMe("t").catch((e) => [e.code, describeCarbonError(e)])).toEqual(["http_error", expect.stringMatching(/trouble/)]);
    expect(describeCarbonError(new CarbonError(401, "x", "x"))).toMatch(/Sign in again/);
    expect(describeCarbonError(new CarbonError(429, "x", "x"))).toMatch(/Too many/);
    expect(describeCarbonError(new TypeError("Failed to fetch"))).toMatch(/Can't reach Carbon/);
    expect(describeCarbonError(new Error("boom"))).toBe("boom");
    expect(describeCarbonError(42)).toBe("Something went wrong.");
  });
});

describe("account session", () => {
  beforeEach(() => {
    invoke.mockReset();
    openUrl.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.unstubAllGlobals());

  it("isn't required unless the build says so, and makes no calls without a saved token", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    invoke.mockResolvedValueOnce(null);
    await account.boot();
    expect(account.required).toBe(false);
    expect(account.open).toBe(true);
    expect(account.status).toBe("signed-out");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("restores a saved session and loads the profile", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(200, { user })));
    invoke.mockResolvedValueOnce("saved");
    await account.boot();
    expect(account.status).toBe("signed-in");
    expect(account.user).toEqual(user);
  });

  it("stays signed in while Carbon is unreachable, but forgets a revoked token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    invoke.mockResolvedValueOnce("saved");
    await account.boot();
    expect(account.status).toBe("signed-in");
    expect(account.error).toMatch(/Can't reach/);
    vi.stubGlobal("fetch", vi.fn(async () => json(401, { error: { code: "unauthorized", message: "No." } })));
    invoke.mockResolvedValueOnce("revoked");
    await account.boot();
    expect(account.status).toBe("signed-out");
    expect(invoke).toHaveBeenCalledWith("carbon_token_clear", undefined);
  });

  it("signs in through the browser with PKCE and saves the token", async () => {
    let state = "";
    openUrl.mockImplementationOnce(async (url: string) => void (state = new URL(url).searchParams.get("state")!));
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "wait_for_carbon_redirect") {
        await vi.waitFor(() => expect(state).not.toBe(""));
        return `code=abc&state=${state}`;
      }
    });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => json(200, { token: "fresh", user }));
    vi.stubGlobal("fetch", fetchMock);
    await account.signIn();
    expect(account.status).toBe("signed-in");
    expect(invoke).toHaveBeenCalledWith("carbon_token_save", { token: "fresh" });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).code).toBe("abc");
  });

  it("rejects a redirect for someone else's request", async () => {
    invoke.mockImplementation(async (cmd: string) => (cmd === "wait_for_carbon_redirect" ? "code=abc&state=forged" : undefined));
    await account.signIn();
    expect(account.status).toBe("signed-out");
    expect(account.error).toMatch(/did not match/);
    invoke.mockImplementation(async (cmd: string) => (cmd === "wait_for_carbon_redirect" ? "error=access_denied" : undefined));
    await account.signIn();
    expect(account.error).toMatch(/cancelled/);
  });

  it("signs out locally even if the server can't be told", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(200, { user })));
    invoke.mockResolvedValueOnce("saved");
    await account.boot();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    invoke.mockResolvedValue(undefined);
    await account.signOut();
    expect(account.status).toBe("signed-out");
    expect(account.user).toBeNull();
    expect(invoke).toHaveBeenCalledWith("carbon_token_clear", undefined);
  });
});
