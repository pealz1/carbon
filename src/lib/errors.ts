// One catalog for everything that can go wrong: Spotify's Web API, its Web Playback SDK, the
// network and Carbon's local audio engine. Each failure maps to what happened, what Carbon does
// about it on its own, and what the listener can do if it keeps happening.
import { ApiError, NetworkError, type ApiNotice } from "$lib/spotify/api";

/** Events from Spotify's Web Playback SDK, plus Carbon failing to connect it or waiting in vain. */
export type SdkEvent =
  | "initialization_error"
  | "authentication_error"
  | "account_error"
  | "playback_error"
  | "autoplay_failed"
  | "connect_failed"
  | "not_ready";

export class SdkError extends Error {
  constructor(
    readonly event: SdkEvent,
    message: string = event,
  ) {
    super(message);
  }
}

/** A message from the local audio engine (Rust), already written for the listener. */
export class EngineError extends Error {}

/** The automatic fix Carbon applies, or the action it offers the listener. */
export type Fix = "none" | "sign-in" | "reconsent" | "reconnect" | "wait" | "retry" | "start-playback" | "restart";

export interface Problem {
  what: string;
  /** What Carbon did about it on its own; empty when nothing. */
  doing: string;
  /** What the listener can do if it keeps happening; empty when there's nothing useful. */
  persists: string;
  fix: Fix;
}

const problem = (what: string, doing = "", persists = "", fix: Fix = "none"): Problem => ({ what, doing, persists, fix });

const PREMIUM = problem("Playing music in Carbon needs Spotify Premium.", "", "Carbon's player only works with Premium accounts. Browsing still works.");
const DEVICE_LOST = problem(
  "Carbon's player lost its connection to Spotify.",
  "Carbon reconnected it and tried again.",
  "Check your connection. If it keeps happening, restart Carbon.",
  "reconnect",
);

const SDK: Record<SdkEvent, Problem> = {
  initialization_error: problem(
    "Spotify's player couldn't start inside Carbon.",
    "",
    "Restart Carbon. If it keeps happening, update the Microsoft Edge WebView2 Runtime, which plays Spotify's protected audio.",
    "restart",
  ),
  authentication_error: problem("Spotify didn't accept Carbon's sign-in for playback.", "Carbon renewed it and reconnected once.", "Sign in again.", "sign-in"),
  account_error: PREMIUM,
  playback_error: problem("Spotify couldn't play this song.", "", "Try another song. If none play, restart Carbon."),
  autoplay_failed: problem("Windows stopped the music from starting on its own.", "", "Press Start playback.", "start-playback"),
  connect_failed: problem("Carbon's player couldn't connect to Spotify.", "", "Check your connection. Carbon tries again when you press play.", "reconnect"),
  not_ready: DEVICE_LOST,
};

/** Spotify no longer knows Carbon's device id, or the SDK couldn't connect or report one in time. */
export function isDeviceGone(e: unknown): boolean {
  if (e instanceof SdkError) return e.event === "not_ready" || e.event === "connect_failed";
  return e instanceof ApiError && e.status === 404 && /device not found/i.test(e.message);
}

const tried = (retries: number) => (retries > 0 ? `Carbon tried ${retries + 1} times.` : "");

function apiProblem(e: ApiError): Problem {
  if (e.status === 401) return problem("Your Spotify session expired.", "Carbon tried renewing it.", "Sign in again.", "sign-in");
  if (e.status === 403) {
    if (/scope/i.test(e.message)) return problem("Carbon needs a new Spotify permission for this.", "", "Sign in again from the banner at the top.", "reconsent");
    if (/registered/i.test(e.message)) return problem("This Spotify account isn't allowed on that Client ID.", "", "Use your own Spotify app (see the guide).");
    if (e.reason === "PREMIUM_REQUIRED" || /premium/i.test(e.message)) return PREMIUM;
    return problem("Spotify doesn't let apps like Carbon open this.");
  }
  if (isDeviceGone(e)) return DEVICE_LOST;
  if (e.status === 404) return problem("Spotify couldn't find this.");
  if (e.status === 429) return problem("Spotify is rate-limiting Carbon.", e.retries ? "Carbon waited as long as Spotify asked." : "", "Give it a minute.", "wait");
  if (e.status >= 500) return problem("Spotify is having trouble right now.", tried(e.retries), "Try again shortly.", "retry");
  return problem(e.message);
}

function engineProblem(message: string): Problem {
  if (/engine stopped/i.test(message)) return problem(message, "", "", "restart");
  if (/audio device|Couldn't (open|start) /i.test(message)) return problem(message, "", "Pick another output on the Sound page or check Windows sound settings.");
  if (/Couldn't (play|keep playing)/i.test(message)) return problem(message, "", "If other files fail too, check they open in another player.");
  return problem(message);
}

export function explain(e: unknown): Problem {
  if (e instanceof ApiError) return apiProblem(e);
  if (e instanceof SdkError) return SDK[e.event];
  if (e instanceof EngineError) return engineProblem(e.message);
  if (e instanceof NetworkError) return problem("Can't reach Spotify.", tried(e.retries), "Check your connection.", "retry");
  if (e instanceof TypeError) return problem("Can't reach Spotify.", "", "Check your connection.", "retry");
  if (e instanceof Error) return problem(e.message);
  // Rust commands reject with a sentence written for the listener.
  if (typeof e === "string" && e.trim()) return problem(e);
  return problem("Something went wrong.");
}

export const sentence = (p: Problem): string => [p.what, p.doing, p.persists].filter(Boolean).join(" ");

/** Turns any failure into sentences a listener can act on. Full detail goes to the console. */
export const describeError = (e: unknown): string => sentence(explain(e));

/** What Carbon is doing right now about a failed Spotify request. */
export function describeNotice(notice: ApiNotice): string {
  if (notice.kind === "auth-lost") return "Your Spotify session expired and Carbon couldn't renew it.";
  if (notice.kind === "scope-missing") return "Carbon needs a few more Spotify permissions for that.";
  const seconds = Math.max(1, Math.round(notice.waitMs / 1000));
  const lead = { "rate-limit": "Spotify asked Carbon to slow down.", server: "Spotify had a problem.", network: "Couldn't reach Spotify." }[notice.cause];
  return `${lead} Trying again in ${seconds} s.`;
}
