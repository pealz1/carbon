// When Carbon looks for, fetches and installs updates on its own. Installing closes Carbon (the
// installer reopens it), so it only happens by itself when nobody would notice.

/** A minute after launch, so the check never competes with sign-in and the first page. */
export const FIRST_CHECK_MS = 60_000;
/** Then every six hours, for Carbon left running for days. */
export const CHECK_EVERY_MS = 6 * 60 * 60_000;
/** While an update waits, how often to see whether now is a quiet moment. */
export const QUIET_POLL_MS = 60_000;

export type UpdateState = "idle" | "checking" | "current" | "available" | "downloading" | "ready" | "error";

/** A scheduled check only starts when nothing is already found, under way or waiting. */
export const shouldCheck = (state: UpdateState): boolean => state === "idle" || state === "current" || state === "error";

export interface Moment {
  state: UpdateState;
  auto: boolean;
  /** The main window is open (not hidden in the tray). */
  shown: boolean;
  playing: boolean;
}

/** Install by itself only from the tray with nothing playing: no song cut off, no window vanishing. */
export const canInstallQuietly = ({ state, auto, shown, playing }: Moment): boolean => state === "ready" && auto && !shown && !playing;
