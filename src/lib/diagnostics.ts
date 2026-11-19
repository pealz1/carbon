// "Copy diagnostics" (More → Developer): what a bug report needs, and nothing that names the listener.
import type { AppInfo, Settings } from "$lib/native";

export interface DiagnosticsInput {
  info: AppInfo | null;
  settings: Settings | null;
  services: { spotify: boolean; youtube: boolean };
  player: { source: string; status: string; playing: boolean; hasTrack: boolean };
  userAgent: string;
  platform: string;
}

/** Versions, platform and switches only: no names, ids, addresses or file paths. */
export function diagnostics(d: DiagnosticsInput): string {
  const s = d.settings;
  const lines = [
    `Carbon ${d.info?.version ?? "unknown"}`,
    `Platform: ${d.platform}`,
    `Webview: ${d.userAgent}`,
    `Services: ${[d.services.spotify && "Spotify", d.services.youtube && "YouTube Music"].filter(Boolean).join(", ") || "none"}`,
    `Player: ${d.player.source}, ${d.player.status}, ${d.player.hasTrack ? (d.player.playing ? "playing" : "paused") : "nothing loaded"}`,
  ];
  if (s) {
    lines.push(
      `Effects: ${s.effects}${s.gameMode ? " (game mode on)" : ""}, motion ${s.motion}, scale ${Math.round(s.uiScale * 100)}%`,
      `Private session: ${s.privateSession ? "on" : "off"}, close to tray: ${s.closeToTray ? "on" : "off"}, remote: ${s.remoteEnabled ? "on" : "off"}`,
      `Lyrics sources: ${s.lyricsSources.join(", ")}`,
    );
  }
  return lines.join("\n");
}
