import { ApiError } from "$lib/spotify/api";

/** Events from Spotify's Web Playback SDK that Carbon treats as failures (plus waiting on it in vain). */
export type SdkEvent = "initialization_error" | "authentication_error" | "account_error" | "playback_error" | "autoplay_failed" | "not_ready";

export class SdkError extends Error {
  constructor(
    readonly event: SdkEvent,
    message: string = event,
  ) {
    super(message);
  }
}

/** Spotify no longer knows Carbon's device id, or the SDK never reported one in time. */
export function isDeviceGone(e: unknown): boolean {
  if (e instanceof SdkError) return e.event === "not_ready";
  return e instanceof ApiError && e.status === 404 && /device not found/i.test(e.message);
}

/** Turns API/network failures into a sentence a listener can act on. Full detail goes to the console. */
export function describeError(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.status) {
      case 401:
        return "Your Spotify session expired. Sign in again.";
      case 403:
        if (/scope/i.test(e.message)) return "Carbon needs a new Spotify permission for this. Sign in again from Settings.";
        return "Spotify doesn't let apps like Carbon open this.";
      case 404:
        return "Spotify couldn't find this.";
      case 429:
        return "Spotify is rate-limiting Carbon. Give it a minute.";
      default:
        return e.status >= 500 ? "Spotify is having trouble right now. Try again shortly." : e.message;
    }
  }
  if (e instanceof TypeError) return "Can't reach Spotify. Check your connection.";
  return e instanceof Error ? e.message : "Something went wrong.";
}
