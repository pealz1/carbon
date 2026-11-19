// The title bar's "More" menu: windows and views, sleep timer, sound, private session, help and quitting.
import { goto } from "$app/navigation";
import { appDataDir } from "@tauri-apps/api/path";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { copyText } from "$lib/clipboard";
import { diagnostics } from "$lib/diagnostics";
import { exit } from "@tauri-apps/plugin-process";
import { dialogs } from "$lib/dialogs.svelte";
import { describeError } from "$lib/errors";
import type { MenuEntry, MenuItem } from "$lib/menu.svelte";
import { appInfo } from "$lib/native";
import { player } from "$lib/player.svelte";
import { popouts } from "$lib/popout/host.svelte";
import { prefs } from "$lib/preferences.svelte";
import { services } from "$lib/services.svelte";
import { SLEEP_PRESETS, sleepTimer } from "$lib/sleep-timer.svelte";
import { toasts } from "$lib/toast.svelte";
import { updates } from "$lib/updates.svelte";
import { view } from "$lib/view.svelte";

const LINKS = {
  guide: "https://getcarbon.cc/setup",
  bug: "https://github.com/pealz1/carbon/issues/new/choose",
  source: "https://github.com/pealz1/carbon",
  site: "https://getcarbon.cc",
};

const open = (url: string) => () => openUrl(url).catch((e) => toasts.error(`Couldn't open the link: ${describeError(e)}`));

function sleepItems(): MenuEntry[] {
  return [
    ...SLEEP_PRESETS.map((minutes): MenuItem => ({ label: minutes === 60 ? "1 hour" : `${minutes} minutes`, action: () => sleepTimer.start(minutes) })),
    { label: "End of this song", disabled: !player.track, action: () => sleepTimer.endOfSong() },
    ...(sleepTimer.current ? (["separator", { label: "Turn off timer", icon: "close", action: () => sleepTimer.cancel() }] as const) : []),
  ];
}

async function togglePrivate(): Promise<void> {
  const on = !prefs.value?.privateSession;
  if (await prefs.update({ privateSession: on })) {
    toasts.show(on ? "Private session on. Nothing goes to Discord, Last.fm, ListenBrainz or your history." : "Private session off.");
  }
}

async function toggleGameMode(): Promise<void> {
  const on = !prefs.value?.gameMode;
  if (await prefs.update({ gameMode: on })) toasts.show(on ? "Game mode on: no effects or motion, and the visualizer rests." : "Game mode off.");
}

async function copyDiagnostics(): Promise<void> {
  const info = await appInfo().catch(() => null);
  const text = diagnostics({
    info,
    settings: prefs.value,
    services: { spotify: services.active.spotify, youtube: services.active.youtube },
    player: { source: player.source, status: player.status, playing: !player.paused, hasTrack: !!player.track },
    userAgent: navigator.userAgent,
    platform: navigator.platform,
  });
  await copyText(text, "Diagnostics copied. Paste them into your bug report.");
}

async function openDataFolder(): Promise<void> {
  try {
    await revealItemInDir(await appDataDir());
  } catch (e) {
    toasts.error(`Couldn't open the folder: ${describeError(e)}`);
  }
}

async function checkUpdates(): Promise<void> {
  await updates.check();
  if (updates.state === "available") toasts.show(`Carbon ${updates.version} is ready. Install it from Settings.`);
  else if (updates.state === "current") toasts.show("You're on the latest Carbon.");
  else if (updates.error) toasts.error(updates.error);
}

async function about(): Promise<void> {
  try {
    toasts.show(`Carbon ${(await appInfo()).version}. Free and open source, made for listening.`);
  } catch (e) {
    toasts.error(describeError(e));
  }
}

async function quit(): Promise<void> {
  try {
    await exit(0);
  } catch (e) {
    toasts.error(`Couldn't quit: ${describeError(e)}`);
  }
}

export function appMenu(): MenuEntry[] {
  return [
    { label: "Now playing", icon: "album", action: () => goto("/now-playing") },
    { label: "Cinema mode", icon: "screen", action: view.enterCinema },
    { label: popouts.miniShown ? "Close mini player" : "Mini player", icon: "collapse", action: popouts.toggleMini },
    { label: popouts.lyrics ? "Close lyrics window" : "Lyrics in a window", icon: "lyrics", action: popouts.toggleLyrics },
    { label: view.fullscreen ? "Leave full screen" : "Full screen", icon: view.fullscreen ? "collapse" : "expand", action: view.toggleFullscreen },
    "separator",
    { label: sleepTimer.current ? "Sleep timer (on)" : "Sleep timer", icon: "moon", items: sleepItems() },
    { label: "Sound settings", icon: "equalizer", action: () => goto("/sound") },
    { label: prefs.value?.privateSession ? "End private session" : "Private session", icon: "block", action: togglePrivate },
    { label: prefs.value?.gameMode ? "End game mode" : "Game mode", icon: "speed", action: toggleGameMode },
    "separator",
    { label: "Settings", icon: "settings", action: () => goto("/settings") },
    { label: "Check for updates", icon: "refresh", disabled: updates.state === "checking" || updates.state === "downloading", action: checkUpdates },
    {
      label: "Help",
      icon: "note",
      items: [
        { label: "Keyboard shortcuts", icon: "keyboard", action: () => (dialogs.shortcuts = true) },
        { label: "Setup guide", icon: "link", action: open(LINKS.guide) },
        { label: "Report a bug", icon: "link", action: open(LINKS.bug) },
        { label: "Source on GitHub", icon: "link", action: open(LINKS.source) },
        { label: "getcarbon.cc", icon: "link", action: open(LINKS.site) },
      ],
    },
    {
      label: "Developer",
      icon: "keyboard",
      items: [
        { label: "Copy diagnostics", icon: "duplicate", action: copyDiagnostics },
        { label: "Open data folder", icon: "folder", action: openDataFolder },
        { label: "Reload interface", icon: "refresh", action: () => location.reload() },
      ],
    },
    { label: "About Carbon", icon: "spark", action: about },
    "separator",
    { label: "Quit Carbon", icon: "close", danger: true, action: quit },
  ];
}
