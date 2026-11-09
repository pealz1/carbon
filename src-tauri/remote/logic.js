// Pure helpers for the phone remote (tested in logic.test.js). No DOM, no network.

export const TOKEN_KEY = "carbon.remote.token";
export const REPEAT_ORDER = ["off", "context", "track"];
const SECRET = /^(?:[0-9a-f]{32}|\d{6})$/;

/** The pairing secret from a `#token=…` fragment (QR code), or null. */
export function tokenFromHash(hash) {
  const value = new URLSearchParams(String(hash ?? "").replace(/^#/, "")).get("token");
  return value && SECRET.test(value) ? value : null;
}

export const isCode = (text) => /^\d{6}$/.test(String(text ?? "").trim());

/** A developer token, as Carbon hands to remotes that paired with the (expiring) code. */
export const isToken = (value) => typeof value === "string" && /^[0-9a-f]{32}$/.test(value);

export function formatTime(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Where playback is now: the server sends position on changes and about once a second. */
export function positionAt(state, receivedAt, now) {
  if (!state) return 0;
  if (state.paused) return state.positionMs;
  return Math.min(state.durationMs, state.positionMs + Math.max(0, now - receivedAt));
}

export const nextRepeat = (mode) => REPEAT_ORDER[(REPEAT_ORDER.indexOf(mode) + 1) % REPEAT_ORDER.length];

export const artistLine = (artists) => (Array.isArray(artists) ? artists.join(", ") : "");

/** A short, friendly label for Settings → Remote → Connected devices. */
export function deviceLabel(userAgent) {
  const ua = String(userAgent ?? "");
  if (/iPad/.test(ua)) return "iPad";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? "Android phone" : "Android tablet";
  return "Browser";
}

/** Turns a socket.io connect_error into a sentence and whether retrying could help. */
export function describeConnectError(message) {
  switch (message) {
    case "unauthorized":
      return { fatal: true, forget: true, text: "That code didn't work. Check Settings → Remote in Carbon." };
    case "rate_limited":
      return { fatal: true, forget: false, text: "Too many tries. Wait a minute, then try again." };
    case "too_many_devices":
      return { fatal: true, forget: false, text: "Too many remotes are connected. Disconnect one in Carbon first." };
    case "forbidden":
      return { fatal: true, forget: false, text: "Carbon only accepts remotes on your home network." };
    default:
      return { fatal: false, forget: false, text: "Can't reach Carbon. Is it open, on the same Wi-Fi?" };
  }
}
