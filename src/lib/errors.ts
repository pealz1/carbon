import { ApiError } from "$lib/spotify/api";

/** Turns API/network failures into a sentence a listener can act on. Full detail goes to the console. */
export function describeError(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.status) {
      case 401:
        return "Your Spotify session expired. Sign in again.";
      case 403:
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
