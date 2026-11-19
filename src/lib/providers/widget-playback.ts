import { invoke } from "@tauri-apps/api/core";
/** One visible SoundCloud widget. Closing it releases the channel and the audio. */
export function playWidget(
  url: string,
  volume: number,
  start: number,
  onState: (paused: boolean, position: number, duration: number) => void,
  onFinish: () => void,
  onError: (reason: string) => void,
) {
  const frame = document.createElement("iframe"),
    channel = new MessageChannel();
  frame.title = "SoundCloud playback";
  frame.sandbox.add("allow-scripts", "allow-same-origin");
  frame.allow = "autoplay";
  frame.style.cssText = "position:fixed;bottom:105px;right:15px;width:min(350px,80vw);height:140px;z-index:12;border:0";
  let position = start,
    duration = 0,
    paused = false,
    ready = false,
    closed = false;
  function send(type: string, value?: number) {
    if (ready && !closed) channel.port1.postMessage({ type, value });
  }
  const timer = setTimeout(() => {
    if (!closed && !ready) onError("SoundCloud's player did not respond.");
  }, 30000);
  channel.port1.onmessage = ({ data }) => {
    if (closed) return;
    if (typeof data?.error === "string") {
      onError(data.error);
      return;
    }
    switch (data?.type) {
      case "ready":
        ready = true;
        clearTimeout(timer);
        duration = Number(data.duration) || 0;
        send("volume", volume * 100);
        if (position) send("seek", position);
        send(paused ? "pause" : "play");
        break;
      case "play":
        paused = false;
        break;
      case "pause":
        paused = true;
        break;
      case "finish":
        onFinish();
        return;
      case "progress":
        if (Number.isFinite(data.position)) position = data.position;
        break;
      default:
        return;
    }
    onState(paused, position, duration);
  };
  void invoke<string>("provider_widget_url").then(src=>{
    if(closed)return;
    frame.onload=()=>{if(!closed)frame.contentWindow?.postMessage({type:"play-public-soundcloud",url},new URL(src).origin,[channel.port2]);};
    frame.src=src;document.body.append(frame);
  }).catch(()=>{if(!closed)onError("Could not start the local SoundCloud player.");});
  return {
    get position() {
      return position;
    },
    toggle() {
      paused = !paused;
      send(paused ? "pause" : "play");
    },
    seek(ms: number) {
      position = ms;
      send("seek", ms);
    },
    volume(value: number) {
      volume = value;
      send("volume", value * 100);
    },
    close() {
      closed = true;
      clearTimeout(timer);
      channel.port1.close();
      frame.remove();
    },
  };
}
