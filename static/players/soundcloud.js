// The remote widget API runs in this isolated player. Only media controls and public metadata cross the port.
window.addEventListener("message", function connect(event) {
  const mode = event.data?.type;
  if (
    event.source !== window.parent ||
    !["read-public-soundcloud", "play-public-soundcloud"].includes(mode) ||
    event.ports.length !== 1
  )
    return;
  const port = event.ports[0];
  window.removeEventListener("message", connect);
  try {
    const url = new URL(event.data.url);
    const permalink = ["soundcloud.com", "www.soundcloud.com"].includes(url.hostname);
    const resource = url.hostname === "api.soundcloud.com" && /^\/tracks\/\d{1,20}$/.test(url.pathname);
    if (url.protocol !== "https:" || !(permalink || resource) || url.username || url.password || url.port)
      throw Error();
    const frame = document.getElementById("player");
    frame.allow = "autoplay";
    frame.src =
      "https://w.soundcloud.com/player/?" +
      new URLSearchParams({ url: url.href, auto_play: "false", show_artwork: "true" });
    const widget = window.SC.Widget(frame),
      events = window.SC.Widget.Events;
    widget.bind(events.ERROR, () => port.postMessage({ error: "SoundCloud could not open this player." }));
    if (mode === "read-public-soundcloud") {
      widget.bind(events.READY, () =>
        widget.getSounds((sounds) => {
          if (!Array.isArray(sounds) || sounds.length > 10000) {
            port.postMessage({ error: "SoundCloud returned an unsupported set." });
            return;
          }
          port.postMessage({
            songs: sounds.map((s) => ({
              title: s.title,
              artist: s.publisher_metadata?.artist || s.user?.username || "",
              durationMs: s.duration || 0,
              image: s.artwork_url || s.user?.avatar_url,
              url: s.permalink_url,
            })),
          });
        }),
      );
    } else {
      port.onmessage = ({ data }) => {
        if (data?.type === "play") widget.play();
        if (data?.type === "pause") widget.pause();
        if (data?.type === "volume" && Number.isFinite(data.value))
          widget.setVolume(Math.max(0, Math.min(100, data.value)));
        if (data?.type === "seek" && Number.isFinite(data.value)) widget.seekTo(Math.max(0, data.value));
      };
      widget.bind(events.READY, () => widget.getDuration((duration) => port.postMessage({ type: "ready", duration })));
      widget.bind(events.PLAY, () => port.postMessage({ type: "play" }));
      widget.bind(events.PAUSE, () => port.postMessage({ type: "pause" }));
      widget.bind(events.FINISH, () => port.postMessage({ type: "finish" }));
      widget.bind(events.PLAY_PROGRESS, (e) => port.postMessage({ type: "progress", position: e.currentPosition }));
    }
  } catch {
    port.postMessage({ error: "SoundCloud’s public player could not open this link." });
  }
});
