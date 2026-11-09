// Client for the Carbon accounts API (cloud/API.md, v1): the desktop PKCE sign-in, the profile
// and sign-out. Responses are validated before the app uses them.
import { CARBON } from "$lib/config";

export interface CarbonUser {
  id: string;
  email: string;
  plan: string;
  createdAt: string;
}

export class CarbonError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const MAX_FIELD = 320;
const isText = (value: unknown, max = MAX_FIELD): value is string => typeof value === "string" && value.length > 0 && value.length <= max;
const unexpected = () => new CarbonError(502, "bad_response", "Carbon's server sent something unexpected. Try again later.");

export function parseUser(raw: unknown): CarbonUser {
  const user = raw as Partial<Record<keyof CarbonUser, unknown>> | null;
  if (!user || !isText(user.id) || !isText(user.email) || !user.email.includes("@") || !isText(user.plan, 64) || !isText(user.createdAt, 64)) {
    throw unexpected();
  }
  return { id: user.id, email: user.email, plan: user.plan, createdAt: user.createdAt };
}

async function call(path: string, init: RequestInit = {}, token?: string): Promise<unknown> {
  const res = await fetch(`${CARBON.apiUrl}${path}`, {
    ...init,
    headers: {
      ...(init.body !== undefined && { "Content-Type": "application/json" }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });
  const body: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const error = (body as { error?: { code?: unknown; message?: unknown } } | null)?.error;
    const message = isText(error?.message, 500) ? error.message : `Carbon's server answered ${res.status}.`;
    throw new CarbonError(res.status, isText(error?.code, 64) ? error.code : "http_error", message);
  }
  return body;
}

/** The page that signs you in on getcarbon.cc and sends the browser back to Carbon. */
export function loginUrl(state: string, codeChallenge: string): string {
  const url = new URL(CARBON.loginUrl);
  url.search = new URLSearchParams({
    redirect_uri: CARBON.redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

export async function exchangeCode(code: string, codeVerifier: string): Promise<{ token: string; user: CarbonUser }> {
  const body = (await call("/v1/app/token", { method: "POST", body: JSON.stringify({ code, code_verifier: codeVerifier }) })) as {
    token?: unknown;
    user?: unknown;
  } | null;
  if (!isText(body?.token, 4096) || /\s/.test(body.token)) throw unexpected();
  return { token: body.token, user: parseUser(body.user) };
}

export async function fetchMe(token: string): Promise<CarbonUser> {
  const body = (await call("/v1/me", {}, token)) as { user?: unknown } | null;
  return parseUser(body?.user);
}

export async function logout(token: string): Promise<void> {
  await call("/v1/auth/logout", { method: "POST" }, token);
}

/** A sentence for the listener; the details go to the console. */
export function describeCarbonError(e: unknown): string {
  if (e instanceof CarbonError) {
    if (e.status === 401) return "Your Carbon session ended. Sign in again.";
    if (e.status === 429) return "Too many tries. Wait a minute, then try again.";
    if (e.status >= 500) return "Carbon's servers are having trouble. Try again shortly.";
    return e.message;
  }
  if (e instanceof TypeError) return "Can't reach Carbon's servers. Check your connection.";
  return e instanceof Error ? e.message : "Something went wrong.";
}
