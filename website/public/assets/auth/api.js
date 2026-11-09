/*
  Carbon accounts API client (contract: cloud/API.md, base https://api.getcarbon.cc).
  Every request sends the session cookie and the CSRF header. Errors become ApiError:
    status 0 / code "unavailable"  network failure, or no API answering (not deployed yet)
    status 429                      rate limited; retryAfter in seconds when known
    otherwise                       the server's { error: { code, message } } envelope
*/

export const API_BASE = "https://api.getcarbon.cc";
export const UNAVAILABLE = "Carbon accounts aren’t available yet — check back soon.";

const HINT_KEY = "carbon.signedIn";

const FALLBACK = {
  400: "Check the details and try again.",
  401: "Your session has ended. Sign in again.",
  403: "This request was blocked for your security. Reload the page and try again.",
  404: "That wasn’t found.",
  409: "That conflicts with something that already exists.",
  423: "This account is temporarily locked. Try again later.",
  429: "Too many attempts. Wait a moment and try again.",
};

export class ApiError extends Error {
  constructor({ status, code, message, retryAfter = null }) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

function parseRetryAfter(header, envelope) {
  if (header) {
    const secs = Number(header);
    if (Number.isFinite(secs) && secs >= 0) return Math.ceil(secs);
    const date = Date.parse(header);
    if (!Number.isNaN(date)) return Math.max(0, Math.ceil((date - Date.now()) / 1000));
  }
  const fromBody = Number(envelope?.retryAfter);
  return Number.isFinite(fromBody) && fromBody >= 0 ? Math.ceil(fromBody) : null;
}

async function readJson(res) {
  const type = res.headers.get("Content-Type") || "";
  if (!type.includes("application/json")) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** Calls the API. Reads window.fetch at call time so tests can stub it. */
export async function api(path, { method = "GET", body, signal } = {}) {
  const headers = { "X-Carbon-CSRF": "1", Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res;
  try {
    res = await window.fetch(API_BASE + path, {
      method,
      credentials: "include",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    console.warn(`Carbon API ${method} ${path} failed:`, err);
    throw new ApiError({ status: 0, code: "unavailable", message: UNAVAILABLE });
  }

  if (res.status === 204) return {};
  const data = await readJson(res);
  if (res.ok) return data ?? {};

  const envelope = data && typeof data.error === "object" && data.error ? data.error : null;
  // No envelope on a 404 or 5xx means nothing is serving the API yet.
  if (!envelope && (res.status === 404 || res.status >= 500)) {
    throw new ApiError({ status: res.status, code: "unavailable", message: UNAVAILABLE });
  }

  const code = typeof envelope?.code === "string" ? envelope.code : `http_${res.status}`;
  const message = typeof envelope?.message === "string" && envelope.message
    ? envelope.message
    : FALLBACK[res.status] || "Something went wrong. Try again.";
  throw new ApiError({
    status: res.status,
    code,
    message,
    retryAfter: res.status === 429 || res.status === 423 ? parseRetryAfter(res.headers.get("Retry-After"), envelope) : null,
  });
}

/** Remembers that this browser has signed in, so the header knows to check /v1/me. */
export const sessionHint = {
  has() { try { return window.localStorage.getItem(HINT_KEY) === "1"; } catch { return false; } },
  set() { try { window.localStorage.setItem(HINT_KEY, "1"); } catch { /* storage blocked: header stays signed out */ } },
  clear() { try { window.localStorage.removeItem(HINT_KEY); } catch { /* nothing stored */ } },
};

/** Sends an already signed-in visitor on to `to` (only checks when this browser has signed in before). */
export async function redirectIfSignedIn(to) {
  if (!sessionHint.has()) return;
  try {
    await api("/v1/me");
    window.location.replace(to);
  } catch (err) {
    if (err?.status === 401) sessionHint.clear();
  }
}
