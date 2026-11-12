// The app's one keydown handler: decides whether a key press is a shortcut here, then runs it.
import { goto } from "$app/navigation";
import { abLoop } from "$lib/ab-loop.svelte";
import { dialogs } from "$lib/dialogs.svelte";
import { menu } from "$lib/menu.svelte";
import { player } from "$lib/player.svelte";
import { saved } from "$lib/saved.svelte";
import { isActivatable, isTyping, matchShortcut, VOLUME_STEP, type ShortcutAction } from "$lib/shortcuts";
import { toasts } from "$lib/toast.svelte";
import { view } from "$lib/view.svelte";

const REPEATABLE = new Set<ShortcutAction>(["volume-up", "volume-down"]);

const nudgeVolume = (by: number) => player.setVolume(Math.round((player.volume + by) * 100) / 100);

async function likeCurrent(): Promise<void> {
  const uri = player.track?.uri;
  if (!uri) return;
  if (await saved.toggle(uri)) toasts.show(saved.has(uri) ? "Saved to Liked Songs." : "Removed from Liked Songs.");
}

export function run(action: ShortcutAction): unknown {
  switch (action) {
    case "toggle-play":
      return player.togglePlay();
    case "previous":
      return player.previous();
    case "next":
      return player.next();
    case "volume-up":
      return nudgeVolume(VOLUME_STEP);
    case "volume-down":
      return nudgeVolume(-VOLUME_STEP);
    case "like":
      return likeCurrent();
    case "search":
      if (view.cinema) void view.exitCinema();
      return goto("/search");
    case "fullscreen":
      return view.toggleFullscreen();
    case "cinema":
      return view.toggleCinema();
    case "loop":
      return abLoop.step();
    case "shortcuts":
      dialogs.shortcuts = true;
      return;
    case "escape":
      return view.exitCinema();
  }
}

export function handleKey(event: KeyboardEvent): void {
  if (event.defaultPrevented || menu.current) return; // open menus handle their own keys
  const action = matchShortcut(event);
  if (!action) return;
  if (action !== "fullscreen" && (dialogs.anyOpen || isTyping(event.target))) return;
  if (action === "toggle-play" && isActivatable(event.target)) return;
  if (action === "escape" && !view.cinema) return;
  if (event.repeat && !REPEATABLE.has(action)) return;
  event.preventDefault();
  void run(action);
}
