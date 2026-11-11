// Which music services Carbon connects to: Spotify, YouTube Music or both. Asked once after the
// Carbon account, changeable in Settings. A service that's off loads nothing: with YouTube Music
// only, Spotify's player never loads and Spotify's API is never called.
import { invoke } from "@tauri-apps/api/core";
import type { Services } from "$lib/native";
import { player } from "$lib/player.svelte";
import { prefs } from "$lib/preferences.svelte";
import { session } from "$lib/session.svelte";
import { youtube } from "$lib/youtube/session.svelte";

export type { Services } from "$lib/native";
export type Screen = "booting" | "choose" | "spotify-setup" | "app";
type SpotifyStatus = typeof session.status;

/** What's running once the app is open. */
export interface Active {
  /** Spotify is on and signed in: its pages, playlists and player are live. */
  spotify: boolean;
  youtube: boolean;
  /** Where Home goes. */
  home: string;
}

/**
 * What the window shows. Spotify-only keeps the old rule (no app until Spotify is signed in).
 * With YouTube Music on, the app opens anyway; Spotify's setup shows only right after choosing
 * it (`setupNow`), and can be finished later from Settings.
 */
export function screenFor(services: Services | null | undefined, spotify: SpotifyStatus, setupNow = false): Screen {
  if (services === undefined) return "booting";
  if (services === null) return "choose";
  if (!services.spotify) return "app";
  if (spotify === "booting") return "booting";
  if (spotify === "signed-in") return "app";
  return services.youtube && !setupNow ? "app" : "spotify-setup";
}

export function activeFor(services: Services | null | undefined, spotifySignedIn: boolean): Active {
  const spotify = Boolean(services?.spotify) && spotifySignedIn;
  const youtube = Boolean(services?.youtube);
  return { spotify, youtube, home: spotify ? "/" : youtube ? "/youtube" : "/local" };
}

const SPOTIFY_PAGES = /^\/(search|library|liked|album|artist|playlist)(\/|$)/;

/** Where to send a page that belongs to a service that isn't running, or null to stay. */
export function redirectFor(path: string, active: Active): string | null {
  if (!active.spotify && (path === "/" || SPOTIFY_PAGES.test(path))) {
    if (active.youtube && (path === "/search" || path === "/library")) return `/youtube${path}`;
    return active.home;
  }
  if (!active.youtube && (path === "/youtube" || path.startsWith("/youtube/"))) return active.home;
  return null;
}

class ServiceState {
  /** undefined until settings are loaded; null until the listener has chosen. */
  value = $state<Services | null | undefined>(undefined);
  /** Right after choosing Spotify, its setup shows once even if YouTube Music could open the app. */
  setupNow = $state(false);

  constructor() {
    $effect.root(() => {
      $effect(() => {
        if (session.status === "signed-in") this.setupNow = false;
      });
    });
  }

  get screen(): Screen {
    return screenFor(this.value, session.status, this.setupNow);
  }

  get active(): Active {
    return activeFor(this.value, session.status === "signed-in");
  }

  async boot(): Promise<void> {
    const settings = await prefs.load().catch((e) => (console.error("[services] settings", e), null));
    let services = settings?.services ?? null;
    // Carbon before the choice was Spotify-only: someone already signed in isn't asked again.
    if (!services && (await invoke<string | null>("token_load").catch(() => null))) {
      services = { spotify: true, youtube: false };
      await prefs.update({ services });
    }
    this.value = services;
    if (services) await this.#start(services);
  }

  /** First run: connect these services. */
  async choose(next: Services): Promise<boolean> {
    if (!next.spotify && !next.youtube) return false;
    if (!(await prefs.update({ services: next }))) return false;
    this.setupNow = next.spotify;
    this.value = next;
    await this.#start(next);
    return true;
  }

  /** Settings: turn one service on or off. At least one stays on; off disconnects it. */
  async set(service: keyof Services, on: boolean): Promise<boolean> {
    const current = this.value;
    if (!current || current[service] === on) return false;
    const next = { ...current, [service]: on };
    if (!next.spotify && !next.youtube) return false;
    if (!on) await (service === "spotify" ? session.signOut() : youtube.signOut());
    if (!(await prefs.update({ services: next }))) return false;
    this.value = next;
    player.spotifyEnabled = next.spotify;
    if (on && service === "youtube") void youtube.boot();
    if (on && service === "spotify") await session.boot(true);
    return true;
  }

  skipSpotify = (): void => void (this.setupNow = false);

  async #start(services: Services): Promise<void> {
    player.spotifyEnabled = services.spotify;
    if (services.youtube) void youtube.boot();
    await session.boot(services.spotify);
  }
}

export const services = new ServiceState();
