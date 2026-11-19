import { invoke } from "@tauri-apps/api/core";
import type { Collection, Song } from "./catalog";

interface PublicSound {
  id: string;
  title?: string;
  artist?: string;
  durationMs?: number;
  image?: string;
  url?: string;
}
interface Metadata {
  title: string;
  author: string;
  image?: string;
}
const metadata = (value: string) => invoke<Metadata | null>("provider_soundcloud_metadata", { value });
const publicTitle = (m: Metadata) =>
  m.author && m.title.endsWith(" by " + m.author) ? m.title.slice(0, -(" by " + m.author).length) : m.title;

function widgetRows(address: string, src: string, signal?: AbortSignal): Promise<PublicSound[]> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const frame = document.createElement("iframe"),
      channel = new MessageChannel();
    frame.title = "Reading the public SoundCloud player";
    frame.sandbox.add("allow-scripts", "allow-same-origin");
    frame.style.cssText = "width:100%;height:185px;border:0";
    const stop = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      frame.remove();
      channel.port1.close();
    };
    const abort = () => {
      stop();
      reject(signal?.reason || Error("Import cancelled."));
    };
    const timer = setTimeout(() => {
      stop();
      reject(Error("SoundCloud's player timed out. Try again or import an exported track list."));
    }, 25000);
    signal?.addEventListener("abort", abort, { once: true });
    channel.port1.onmessage = ({ data }) => {
      stop();
      if (!Array.isArray(data?.songs) || !data.songs.length || data.songs.length > 10000) {
        reject(Error(data?.error || "SoundCloud didn't share any songs."));
        return;
      }
      if (data.songs.some((s: PublicSound) => !s || !/^\d{1,20}$/.test(s.id))) {
        reject(Error("SoundCloud returned an unrecognized set."));
        return;
      }
      resolve(data.songs);
    };
    frame.onload = () =>
      frame.contentWindow?.postMessage({ type: "read-public-soundcloud", url: address }, new URL(src).origin, [
        channel.port2,
      ]);
    frame.src = src;
    (document.getElementById("provider-import-preview") || document.body).append(frame);
  });
}

export async function completeSounds(rows: PublicSound[], signal?: AbortSignal, lookup = metadata): Promise<Song[]> {
  const songs = new Array<Song>(rows.length),
    cache = new Map<string, Promise<Metadata | null>>();
  let next = 0;
  async function worker() {
    while (next < rows.length) {
      signal?.throwIfAborted();
      const i = next++,
        sound = rows[i];
      if (typeof sound.title === "string" && sound.title.trim()) {
        songs[i] = {
          title: sound.title,
          artist: sound.artist || "",
          durationMs: Number(sound.durationMs) || 0,
          image: sound.image,
          url: sound.url,
        };
        continue;
      }
      let response = cache.get(sound.id);
      if (!response) {
        response = lookup(sound.id);
        cache.set(sound.id, response);
      }
      const m = await response;
      songs[i] = m?.title
        ? { title: publicTitle(m), artist: m.author || "", durationMs: 0, image: m.image }
        : { title: "Unavailable SoundCloud track", artist: "", durationMs: 0, unavailable: true };
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, rows.length) }, worker));
  signal?.throwIfAborted();
  return songs;
}
export async function soundcloudWidget(address: string, signal?: AbortSignal): Promise<Collection> {
  const src = await invoke<string>("provider_widget_url");
  const [rows, info] = await Promise.all([widgetRows(address, src, signal), metadata(address).catch(() => null)]);
  const title = info?.title
    ? publicTitle(info)
    : new URL(address).pathname.split("/").filter(Boolean).at(-1)?.replaceAll("-", " ") || "SoundCloud set";
  return { title, songs: await completeSounds(rows, signal) };
}
