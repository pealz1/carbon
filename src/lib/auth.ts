// Spotify sign-in (Authorization Code + PKCE). The refresh token lives in Windows Credential
// Manager via Rust; the access token only ever lives in memory.
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { SPOTIFY, TIMING } from "$lib/config";
import { challengeFor, randomString } from "$lib/pkce";
import { ApiError, useTokenSource } from "$lib/spotify/api";

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

let clientId = "";
let accessToken: string | null = null;
let expiresAt = 0;
let refreshToken: string | null = null;
let refreshing: Promise<string> | null = null;
let grantedScopes: string | null = null;

/** The Spotify app every token request is made for. Refresh tokens only work with their own app. */
export function useClientId(id: string): void {
  clientId = id;
}

export const hasClientId = (): boolean => clientId.length > 0;

export const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
  Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms))]);

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${SPOTIFY.accountsUrl}/api/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, ...params }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error_description ?? body.error ?? `Sign-in failed (${res.status})`);
  if (typeof body.access_token !== "string") throw new ApiError(500, "Spotify returned no access token");
  return body as TokenResponse;
}

async function adopt(tokens: TokenResponse): Promise<string> {
  accessToken = tokens.access_token;
  expiresAt = Date.now() + tokens.expires_in * 1000;
  if (typeof tokens.scope === "string") grantedScopes = tokens.scope;
  // Spotify may rotate the refresh token; the old one stops working once a new one is issued.
  if (tokens.refresh_token && tokens.refresh_token !== refreshToken) {
    refreshToken = tokens.refresh_token;
    await invoke("token_save", { token: refreshToken });
  }
  return accessToken;
}

async function refresh(): Promise<string> {
  if (!refreshToken) throw new ApiError(401, "Not signed in");
  refreshing ??= tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken })
    .then(adopt)
    .finally(() => (refreshing = null));
  return refreshing;
}

/**
 * Scopes Carbon asks for that the current sign-in lacks. A refresh token keeps the scopes it was
 * first granted, so listeners who signed in before a new feature must sign in again for it.
 */
export function missingScopes(granted: string | null = grantedScopes, wanted: string = SPOTIFY.scopes): string[] {
  if (granted === null) return [];
  const have = new Set(granted.split(" "));
  return wanted.split(" ").filter((scope) => !have.has(scope));
}

export async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < expiresAt - TIMING.tokenRefreshMarginMs) return accessToken;
  return refresh();
}

const tokenSource = { get: getAccessToken, refresh };

/** Signs in silently with the saved refresh token. False when there is none or it was revoked. */
export async function restoreSession(): Promise<boolean> {
  refreshToken = await invoke<string | null>("token_load");
  if (!refreshToken) return false;
  try {
    await refresh();
  } catch (e) {
    if (e instanceof ApiError && (e.status === 400 || e.status === 401)) {
      await signOut(); // revoked or expired: start over with a fresh sign-in
      return false;
    }
    throw e;
  }
  useTokenSource(tokenSource);
  return true;
}

export async function signIn(): Promise<void> {
  const verifier = randomString(64);
  const state = randomString(16);
  const url = new URL(`${SPOTIFY.accountsUrl}/authorize`);
  if (!clientId) throw new Error("Add your Spotify Client ID first.");
  url.search = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: SPOTIFY.redirectUri,
    code_challenge_method: "S256",
    code_challenge: await challengeFor(verifier),
    scope: SPOTIFY.scopes,
    state,
  }).toString();
  const redirect = withTimeout(invoke<string>("wait_for_oauth_redirect"), TIMING.loginTimeoutMs, "Sign-in");
  await openUrl(url.toString());
  const params = new URLSearchParams(await redirect);
  if (params.get("error")) throw new Error(params.get("error") === "access_denied" ? "Sign-in was cancelled." : `Spotify refused sign-in: ${params.get("error")}`);
  if (params.get("state") !== state) throw new Error("Sign-in response did not match this request. Please try again.");
  const code = params.get("code");
  if (!code) throw new Error("Spotify sent no sign-in code.");
  await adopt(
    await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: SPOTIFY.redirectUri, code_verifier: verifier }),
  );
  useTokenSource(tokenSource);
}

export async function signOut(): Promise<void> {
  accessToken = null;
  refreshToken = null;
  grantedScopes = null;
  expiresAt = 0;
  useTokenSource(null);
  await invoke("token_clear");
}
