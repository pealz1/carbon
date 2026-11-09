// Carbon account session (feature-flagged). The app token lives in Windows Credential Manager
// ("carbon-session"); without one, nothing here touches the network.
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { withTimeout } from "$lib/auth";
import { CarbonError, describeCarbonError, exchangeCode, fetchMe, loginUrl, logout, type CarbonUser } from "$lib/carbon-account";
import { REQUIRE_CARBON_ACCOUNT, TIMING } from "$lib/config";
import { challengeFor, randomString } from "$lib/pkce";

type Status = "unknown" | "signed-out" | "signing-in" | "signed-in";

class Account {
  status = $state<Status>("unknown");
  user = $state<CarbonUser | null>(null);
  error = $state<string | null>(null);
  readonly required = REQUIRE_CARBON_ACCOUNT;
  #token: string | null = null;

  /** True when the app may open: accounts aren't required, or you're signed in. */
  get open(): boolean {
    return !this.required || this.status === "signed-in";
  }

  /** Restores a saved session and refreshes the profile. Only a 401 signs you out. */
  async boot(): Promise<void> {
    try {
      this.#token = await invoke<string | null>("carbon_token_load");
    } catch (e) {
      console.error("[account] couldn't read the saved session", e);
      this.error = "Couldn't read your saved Carbon sign-in.";
    }
    if (!this.#token) {
      this.status = "signed-out";
      return;
    }
    this.status = "signed-in"; // a saved session counts while Carbon's servers are unreachable
    try {
      this.user = await fetchMe(this.#token);
      this.error = null;
    } catch (e) {
      console.error("[account] profile refresh failed", e);
      if (e instanceof CarbonError && e.status === 401) await this.#forget();
      this.error = describeCarbonError(e);
    }
  }

  async signIn(): Promise<void> {
    this.status = "signing-in";
    this.error = null;
    try {
      const verifier = randomString(64);
      const state = randomString(16);
      const redirect = withTimeout(invoke<string>("wait_for_carbon_redirect"), TIMING.loginTimeoutMs, "Carbon sign-in");
      await openUrl(loginUrl(state, await challengeFor(verifier)));
      const params = new URLSearchParams(await redirect);
      if (params.get("error")) throw new Error("Sign-in was cancelled.");
      if (params.get("state") !== state) throw new Error("Sign-in response did not match this request. Please try again.");
      const code = params.get("code");
      if (!code) throw new Error("Carbon sent no sign-in code.");
      const { token, user } = await exchangeCode(code, verifier);
      await invoke("carbon_token_save", { token });
      this.#token = token;
      this.user = user;
      this.status = "signed-in";
    } catch (e) {
      console.error("[account] sign-in failed", e);
      this.error = describeCarbonError(e);
      this.status = "signed-out";
    }
  }

  async signOut(): Promise<void> {
    const token = this.#token;
    if (token) {
      try {
        await logout(token); // revokes it server-side; forgetting it locally happens regardless
      } catch (e) {
        console.warn("[account] server sign-out failed", e);
      }
    }
    await this.#forget();
  }

  async #forget(): Promise<void> {
    this.#token = null;
    this.user = null;
    this.status = "signed-out";
    try {
      await invoke("carbon_token_clear");
    } catch (e) {
      console.error("[account] couldn't remove the saved session", e);
      this.error = "Couldn't remove your saved Carbon sign-in.";
    }
  }
}

export const account = new Account();
