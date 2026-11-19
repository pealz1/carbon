import { invoke } from "@tauri-apps/api/core";
import type { Collection } from "./catalog";

export async function soundcloudWidget(address: string, signal?: AbortSignal): Promise<Collection> {
  const src=await invoke<string>("provider_widget_url");
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
      reject(signal?.reason || new Error("Import cancelled."));
    };
    const timer = setTimeout(() => {
      stop();
      reject(new Error("SoundCloud's player timed out. Try again or import an exported track list."));
    }, 25000);
    signal?.addEventListener("abort", abort, { once: true });
    channel.port1.onmessage = ({ data }) => {
      stop();
      if (!Array.isArray(data?.songs) || !data.songs.length || data.songs.length > 10000) {
        reject(new Error(data?.error || "SoundCloud didn't share any songs."));
        return;
      }
      const songs = data.songs.filter(
        (s: Record<string, unknown>) =>
          s && typeof s.title === "string" && typeof s.artist === "string" && Number.isFinite(s.durationMs),
      );
      if (songs.length !== data.songs.length) {
        reject(new Error("SoundCloud returned an incomplete set. Choose a track list file to import it."));
        return;
      }
      const slug = new URL(address).pathname.split("/").filter(Boolean).at(-1) || "SoundCloud set";
      resolve({ title: slug.replaceAll("-", " "), songs });
    };
    frame.onload = () =>
      frame.contentWindow?.postMessage({ type: "read-public-soundcloud", url: address }, new URL(src).origin, [channel.port2]);
    frame.src = src;
    (document.getElementById("provider-import-preview") || document.body).append(frame);
  });
}
