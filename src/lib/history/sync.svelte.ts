import { account } from "$lib/account.svelte";
import { describeError } from "$lib/errors";
import { carbonPlaylists } from "$lib/local/playlists.svelte";
import { prefs } from "$lib/preferences.svelte";
import { history } from "./history.svelte";
import { readLibrary, restore, upload, type OnlinePlaylist } from "./cloud";
import type { Entry } from "./entries";

type Uploaded = Pick<Entry, "at" | "uri" | "title" | "artists" | "album" | "durationMs">;
const syncable = (s: Entry) => /^(spotify:track:[a-zA-Z0-9]{22}|ytm:video:[\w-]{11})$/.test(s.uri);
export function direction(local: number | null, savedLocal: number, remote: number, savedRemote: number) {
  if (local === null) return savedRemote === 0 ? "download" : "removed";
  if (!savedRemote || !savedLocal) return "review";
  if (local !== savedLocal) return remote === savedRemote ? "upload" : "review";
  return remote === savedRemote ? "current" : "download";
}
class MusicSync {
  busy = $state(false);
  status = $state("");
  changes = $state(0);
  enabled(part: "history" | "playlists") {
    void this.changes;
    return !!account.user && localStorage.getItem("carbon-auto-" + part + ":" + account.user.id) === "yes";
  }
  set(part: "history" | "playlists", enabled: boolean) {
    if (!account.user) return;
    localStorage.setItem("carbon-auto-" + part + ":" + account.user.id, enabled ? "yes" : "no");
    this.changes++;
    if (part === "history" && !enabled) history.setOnline(null, []);
    if (enabled) void this.run();
  }
  async clearHistory() {
    const id = account.user?.id;
    if (!id) throw Error("Sign in to manage online history.");
    if (this.busy) throw Error("Wait for the current sync to finish before clearing online history.");
    this.set("history", false);
    await account.music("/me/history", { method: "DELETE" });
    if (id === account.user?.id) {
      history.setOnline(null, []);
      localStorage.setItem("carbon-history-sent:" + id, String(Date.now()));
    }
  }
  async run() {
    const id = account.user?.id;
    if (!id || this.busy || prefs.value?.privateSession || (!this.enabled("playlists") && !this.enabled("history")))
      return;
    this.busy = true;
    this.status = "";
    const active = (part: "history" | "playlists") =>
      account.user?.id === id && this.enabled(part) && !prefs.value?.privateSession;
    try {
      const conflicts: string[] = [];
      if (active("playlists")) {
        await carbonPlaylists.load();
        const library = await readLibrary();
        for (const remote of library.playlists) {
          if (!active("playlists")) return;
          const local = carbonPlaylists.find(remote.id);
          const key = "music-revision:" + id + ":" + remote.id;
          const action = direction(
            local?.updatedMs ?? null,
            Number(localStorage.getItem(key + ":local")),
            remote.revision,
            Number(localStorage.getItem(key)),
          );
          if (action === "upload" && local) await upload(local, !!remote.visible);
          else if (action === "review") conflicts.push(remote.name);
          else if (action === "download") {
            const copy = await account.music<OnlinePlaylist>("/me/playlists/" + remote.id);
            if (!active("playlists")) return;
            await restore(copy, local?.updatedMs ?? null);
          }
        }
      }
      if (active("history") && !history.paused) {
        await history.load();
        const marker = "carbon-history-sent:" + id,
          after = Number(localStorage.getItem(marker));
        const fresh = history.deviceEntries.filter((e) => e.at > after && syncable(e)).slice(-5000);
        for (let i = 0; i < fresh.length; i += 40) {
          if (!active("history") || history.paused) return;
          const plays = fresh
            .slice(i, i + 40)
            .map(({ at, uri, title, artists, album, durationMs }) => ({ at, uri, title, artists, album, durationMs }));
          await account.music("/me/history", { method: "POST", body: JSON.stringify({ plays }) });
          if (!active("history")) return;
          localStorage.setItem(marker, String(plays.at(-1)!.at));
        }
        let cursor: number | null = null;
        const remote: Entry[] = [];
        do {
          if (!active("history") || history.paused) return;
          const result: { plays: Uploaded[]; next: number | null } = await account.music(
            "/me/history" + (cursor ? "?before=" + cursor : ""),
          );
          remote.push(
            ...result.plays.map((p) => ({
              ...p,
              image: null,
              source: p.uri.startsWith("ytm:") ? "youtube" : "spotify",
            })),
          );
          if (result.next !== null && (result.next < 1 || (cursor !== null && result.next >= cursor)))
            throw Error("Carbon returned an invalid history page.");
          cursor = result.next;
        } while (cursor !== null && remote.length < 5000);
        if (active("history")) history.setOnline(id, remote);
      }
      this.status = conflicts.length ? "Review changes to " + conflicts.join(", ") : "Library synced.";
    } catch (e) {
      this.status = describeError(e);
    } finally {
      this.busy = false;
    }
  }
  start() {
    const refresh = () => void this.run();
    const timer = setInterval(refresh, 300000);
    window.addEventListener("online", refresh);
    const stop = $effect.root(() => {
      $effect(() => {
        const id = account.user?.id;
        if (id) queueMicrotask(refresh);
        else history.setOnline(null, []);
      });
    });
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", refresh);
      stop();
    };
  }
}
export const musicSync = new MusicSync();
