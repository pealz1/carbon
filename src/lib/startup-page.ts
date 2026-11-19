// Settings → Behaviour → Startup page. "Where you left off" reads the page saved as the listener moved around.
import type { StartupPage } from "$lib/native";

const LAST_KEY = "carbon.lastPage";
const PATHS: Record<Exclude<StartupPage, "last">, string> = { home: "/", library: "/library", liked: "/liked", search: "/search" };

/** Only same-app paths; pop-out windows are never a place to start. */
const isAppPath = (path: string | null): path is string => !!path && path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/popout");

export function startupPath(choice: StartupPage, last: string | null): string {
  if (choice !== "last") return PATHS[choice] ?? "/";
  return isAppPath(last) ? last : "/";
}

export function rememberPage(path: string): void {
  if (!isAppPath(path)) return;
  try {
    localStorage.setItem(LAST_KEY, path);
  } catch {
    // a convenience only: without storage Carbon starts on Home
  }
}

export function lastPage(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}
