// The command palette's actions: playback, layout and windows, the sleep timer, Spotify Connect
// devices and the playlist tools. Each shows only when it can do something right now.
import { goto } from "$app/navigation";
import { page } from "$app/state";
import { abLoop } from "$lib/ab-loop.svelte";
import type { Entry } from "$lib/command-entries";
import { devices } from "$lib/devices.svelte";
import { dialogs } from "$lib/dialogs.svelte";
import { run } from "$lib/keyboard";
import { carbonPlaylists } from "$lib/local/playlists.svelte";
import { player } from "$lib/player.svelte";
import type { Source } from "$lib/playlist-tools/rows";
import { tools } from "$lib/playlist-tools/tools.svelte";
import { popouts } from "$lib/popout/host.svelte";
import { prefs } from "$lib/preferences.svelte";
import { services } from "$lib/services.svelte";
import { session } from "$lib/session.svelte";
import { SLEEP_PRESETS, sleepTimer } from "$lib/sleep-timer.svelte";
import { toasts } from "$lib/toast.svelte";
import { view } from "$lib/view.svelte";
import { youtube } from "$lib/youtube/session.svelte";

const present = (entries: (Entry | false)[]): Entry[] => entries.filter((e): e is Entry => !!e);

function playbackEntries(): Entry[] {
  const playing = !!player.track;
  const loop = abLoop.active ? "Stop looping" : abLoop.a === null ? "Start a loop here" : "End the loop here";
  return present([
    { id: "a:toggle", label: player.paused ? "Play" : "Pause", detail: "Playback", icon: player.paused ? "play" : "pause", run: player.togglePlay },
    playing && { id: "a:next", label: "Next song", detail: "Playback", icon: "next", run: player.next },
    playing && { id: "a:previous", label: "Previous song", detail: "Playback", icon: "prev", run: player.previous },
    playing && { id: "a:like", label: "Like the current song", detail: "Playback", icon: "heart", run: () => run("like") },
    playing && { id: "a:loop", label: loop, detail: "A-B loop", icon: "repeat", run: () => run("loop") },
  ]);
}

function layoutEntries(): Entry[] {
  const romanise = prefs.value?.lyricsRomanise;
  return present([
    { id: "a:lyrics", label: view.lyrics ? "Hide lyrics" : "Show lyrics", detail: "Layout", icon: "lyrics", run: view.toggleLyrics },
    { id: "a:queue", label: view.queue ? "Hide queue" : "Show queue", detail: "Layout", icon: "queue", run: view.toggleQueue },
    { id: "a:mini", label: popouts.miniShown ? "Close mini player" : "Mini player", detail: "Window", icon: "collapse", run: popouts.toggleMini },
    { id: "a:lyrics-window", label: popouts.lyrics ? "Close lyrics window" : "Lyrics in a window", detail: "Window", icon: "lyrics", run: popouts.toggleLyrics },
    { id: "a:cinema", label: "Cinema mode", detail: "Window", icon: "screen", run: view.enterCinema },
    { id: "a:fullscreen", label: view.fullscreen ? "Leave full screen" : "Full screen", detail: "Window", icon: view.fullscreen ? "collapse" : "expand", run: view.toggleFullscreen },
    romanise !== undefined && {
      id: "a:romanise",
      label: romanise ? "Stop romanising lyrics" : "Romanise lyrics",
      detail: "Japanese, Chinese and Korean lyrics",
      icon: "lyrics",
      run: () => prefs.update({ lyricsRomanise: !romanise }),
    },
    { id: "a:shortcuts", label: "Keyboard shortcuts", detail: "Help", icon: "keyboard", run: () => (dialogs.shortcuts = true) },
  ]);
}

const duration = (minutes: number) => (minutes === 60 ? "1 hour" : `${minutes} minutes`);

function sleepEntries(): Entry[] {
  const start = (minutes: number) => () => {
    sleepTimer.start(minutes);
    toasts.show(`The music pauses in ${duration(minutes)}.`);
  };
  return present([
    ...SLEEP_PRESETS.map((m): Entry => ({ id: `a:sleep-${m}`, label: `Sleep timer: ${duration(m)}`, detail: "Pause the music later", icon: "moon", run: start(m) })),
    !!player.track && { id: "a:sleep-song", label: "Sleep timer: end of this song", detail: "Pause the music later", icon: "moon", run: () => sleepTimer.endOfSong() },
    !!sleepTimer.current && { id: "a:sleep-off", label: "Turn off the sleep timer", detail: "Sleep timer", icon: "moon", run: () => sleepTimer.cancel() },
  ]);
}

/** Spotify Connect: move playback to another of your devices, or back to Carbon. */
function deviceEntries(): Entry[] {
  if (!services.active.spotify) return [];
  return devices.list
    .filter((d) => !d.active && !d.restricted)
    .map((d) => ({
      id: `d:${d.id}`,
      label: devices.isCarbon(d) ? "Play on this PC" : `Play on ${d.name}`,
      detail: `Spotify Connect · ${d.type}`,
      icon: "devices",
      run: () => devices.moveTo(d),
    }));
}

const YOUTUBE_PLAYLIST = /^\/youtube\/playlist\/([^/]+)/;

/** The playlist on screen, if the page shows one the playlist tools can read. */
function shownPlaylist(): Source | null {
  const path = page.url.pathname;
  const [, kind, id] = path.split("/");
  if (kind === "playlist" && id) return { kind: "playlist", id, name: session.playlists.find((p) => p.id === id)?.name ?? "this playlist" };
  if (kind === "carbon" && id) return { kind: "carbon", id, name: carbonPlaylists.find(id)?.name ?? "this playlist" };
  const yt = path.match(YOUTUBE_PLAYLIST);
  if (!yt) return null;
  const ytId = decodeURIComponent(yt[1]);
  return { kind: "youtube", id: ytId, name: youtube.playlists.find((p) => p.id === ytId)?.title ?? "this playlist" };
}

function toolEntries(): Entry[] {
  const shown = shownPlaylist();
  return present([
    !!shown && { id: "a:export-shown", label: `Export ${shown.name}`, detail: "Playlist tools", icon: "export", run: () => tools.open(shown, "export") },
    services.active.spotify && {
      id: "a:export-liked",
      label: "Export Liked Songs",
      detail: "Playlist tools",
      icon: "export",
      run: () => tools.open({ kind: "liked", name: "Liked Songs" }, "export"),
    },
    { id: "a:import", label: "Import a playlist", detail: "Playlist tools", icon: "import", run: tools.openImport },
    services.active.spotify && { id: "a:combine", label: "Combine playlists", detail: "Playlist tools", icon: "layouts", run: () => tools.openCombine() },
    { id: "a:backup", label: "Back up or restore your library", detail: "Settings", icon: "restore", run: () => goto("/settings#backup") },
  ]);
}

export const actionEntries = (): Entry[] => [...playbackEntries(), ...layoutEntries(), ...sleepEntries(), ...deviceEntries(), ...toolEntries()];
