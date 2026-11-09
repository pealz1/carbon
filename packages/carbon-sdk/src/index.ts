// @getcarbon/sdk: control Carbon from scripts, overlays and controllers on your network.
import { io, type Socket } from "socket.io-client";
import {
  DEFAULT_PORT,
  PROTOCOL_VERSION,
  REPEAT_MODES,
  isSpotifyUri,
  positionAt,
  type CarbonState,
  type Commands,
  type Hello,
  type RepeatMode,
} from "./protocol.js";

export * from "./protocol.js";

export type CarbonErrorCode =
  | "unauthorized"
  | "rate_limited"
  | "too_many_devices"
  | "forbidden"
  | "unreachable"
  | "timeout"
  | "protocol_mismatch"
  | "invalid_argument"
  | "not_connected";

const MESSAGES: Record<CarbonErrorCode, string> = {
  unauthorized: "Carbon rejected the token. Copy a fresh one from Settings → Remote.",
  rate_limited: "Too many connection attempts. Wait a minute and try again.",
  too_many_devices: "Too many remotes are connected to Carbon. Disconnect one in Settings → Remote.",
  forbidden: "Carbon only accepts connections from your local network.",
  unreachable: "Couldn't reach Carbon. Check the host and port, and that the remote is on in Settings.",
  timeout: "Carbon didn't answer in time.",
  protocol_mismatch: "This SDK doesn't speak the protocol version of this Carbon. Update one of them.",
  invalid_argument: "Invalid argument.",
  not_connected: "Not connected to Carbon right now.",
};

/** Errors the server reports by name in `connect_error`. */
const SERVER_CODES: ReadonlySet<string> = new Set(["unauthorized", "rate_limited", "too_many_devices", "forbidden"]);
const TOKEN = /^(?:[0-9a-f]{32}|\d{6})$/;
const MAX_NAME = 40;
const DEFAULT_TIMEOUT_MS = 10_000;

export class CarbonError extends Error {
  readonly code: CarbonErrorCode;

  constructor(code: CarbonErrorCode, message = MESSAGES[code], options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CarbonError";
    this.code = code;
  }
}

const invalid = (message: string) => new CarbonError("invalid_argument", message);

function toCarbonError(error: Error): CarbonError {
  return SERVER_CODES.has(error.message)
    ? new CarbonError(error.message as CarbonErrorCode)
    : new CarbonError("unreachable", undefined, { cause: error });
}

export interface ConnectOptions {
  /** IP address or host name of the PC running Carbon, e.g. "192.168.1.20". */
  host: string;
  /** Defaults to 10767. */
  port?: number;
  /** The developer token or 6-digit pairing code from Settings → Remote. */
  token: string;
  /** Shown in Carbon's list of connected devices. */
  name?: string;
  /** Use wss:// (only if you put Carbon behind a TLS proxy). */
  secure?: boolean;
  /** How long to wait for the first connection. Defaults to 10 seconds. */
  timeoutMs?: number;
  /** Reconnect after network drops. Defaults to true. */
  autoReconnect?: boolean;
}

export interface CarbonEvents {
  state: (state: CarbonState | null) => void;
  hello: (hello: Hello) => void;
  connect: () => void;
  disconnect: (reason: string) => void;
  reconnecting: (attempt: number) => void;
  /** Fatal: Carbon refused the connection (for example the token was rotated). No more retries. */
  error: (error: CarbonError) => void;
}

type Listener = (...args: never[]) => void;

function endpoint(options: ConnectOptions): string {
  const { host, port = DEFAULT_PORT, token, name, secure = false } = options ?? ({} as ConnectOptions);
  if (typeof host !== "string" || !host.trim() || /[\s/?#@]/.test(host)) throw invalid("host must be a host name or IP address, without a scheme or path.");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw invalid("port must be a whole number between 1 and 65535.");
  if (typeof token !== "string" || !TOKEN.test(token)) throw invalid("token must be the developer token or the 6-digit code from Settings → Remote.");
  if (name !== undefined && (typeof name !== "string" || name.length > MAX_NAME)) throw invalid(`name must be a string of at most ${MAX_NAME} characters.`);
  return `${secure ? "https" : "http"}://${host.trim()}:${port}`;
}

export class CarbonClient {
  readonly #socket: Socket;
  readonly #listeners = new Map<keyof CarbonEvents, Set<Listener>>();
  #state: CarbonState | null = null;
  #receivedAt = 0;
  #hello: Hello | null = null;

  /** Use `connect()` instead. */
  constructor(socket: Socket) {
    this.#socket = socket;
    socket.on("hello", (hello: Hello) => {
      this.#hello = hello;
      this.#emit("hello", hello);
    });
    socket.on("state", (state: CarbonState | null) => {
      this.#state = state;
      this.#receivedAt = Date.now();
      this.#emit("state", state);
    });
    socket.on("connect", () => this.#emit("connect"));
    socket.on("disconnect", (reason: string) => this.#emit("disconnect", reason));
    socket.io.on("reconnect_attempt", (attempt: number) => this.#emit("reconnecting", attempt));
    // While socket.io is still retrying it's a network blip; otherwise Carbon said no.
    socket.on("connect_error", (error: Error) => {
      if (!socket.active) this.#emit("error", toCarbonError(error));
    });
  }

  /** The last state Carbon sent. */
  get state(): CarbonState | null {
    return this.#state;
  }

  get hello(): Hello | null {
    return this.#hello;
  }

  get connected(): boolean {
    return this.#socket.connected;
  }

  /** Live playback position in ms, extrapolated while playing. */
  position(now = Date.now()): number {
    return positionAt(this.#state, this.#receivedAt, now);
  }

  /** Subscribes to an event; returns a function that unsubscribes. */
  on<E extends keyof CarbonEvents>(event: E, listener: CarbonEvents[E]): () => void {
    const set = this.#listeners.get(event) ?? new Set<Listener>();
    set.add(listener as Listener);
    this.#listeners.set(event, set);
    return () => this.off(event, listener);
  }

  off<E extends keyof CarbonEvents>(event: E, listener: CarbonEvents[E]): void {
    this.#listeners.get(event)?.delete(listener as Listener);
  }

  play(): void {
    this.#send("play");
  }

  pause(): void {
    this.#send("pause");
  }

  toggle(): void {
    this.#send("toggle");
  }

  next(): void {
    this.#send("next");
  }

  previous(): void {
    this.#send("previous");
  }

  seek(positionMs: number): void {
    if (!Number.isFinite(positionMs) || positionMs < 0) throw invalid("positionMs must be a number of milliseconds, 0 or more.");
    this.#send("seek", { positionMs: Math.round(positionMs) });
  }

  setVolume(value: number): void {
    if (!Number.isFinite(value) || value < 0 || value > 1) throw invalid("volume must be between 0 and 1.");
    this.#send("volume", { value });
  }

  setShuffle(on: boolean): void {
    if (typeof on !== "boolean") throw invalid("shuffle takes true or false.");
    this.#send("shuffle", { on });
  }

  setRepeat(mode: RepeatMode): void {
    if (!REPEAT_MODES.includes(mode)) throw invalid(`repeat mode must be one of ${REPEAT_MODES.join(", ")}.`);
    this.#send("repeat", { mode });
  }

  /** Plays a Spotify track, album, playlist or artist URI, e.g. "spotify:album:…". */
  playUri(uri: string): void {
    if (!isSpotifyUri(uri)) throw invalid("uri must look like spotify:track:<22 characters> (track, album, playlist or artist).");
    this.#send("playUri", { uri });
  }

  /** Closes the connection for good. */
  disconnect(): void {
    this.#socket.disconnect();
  }

  #send<K extends keyof Commands>(event: K, ...payload: Commands[K] extends undefined ? [] : [Commands[K]]): void {
    // socket.io would buffer and replay commands after a reconnect; a stale "next" is worse than an error.
    if (!this.#socket.connected) throw new CarbonError("not_connected");
    this.#socket.emit(event, ...payload);
  }

  #emit<E extends keyof CarbonEvents>(event: E, ...args: Parameters<CarbonEvents[E]>): void {
    for (const listener of this.#listeners.get(event) ?? []) {
      try {
        (listener as (...a: Parameters<CarbonEvents[E]>) => void)(...args);
      } catch (error) {
        // One broken listener shouldn't starve the others; surface it asynchronously.
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }
}

/**
 * Connects to Carbon and resolves once the first state has arrived.
 * Rejects with a `CarbonError` (unauthorized, unreachable, timeout, …).
 */
export function connect(options: ConnectOptions): Promise<CarbonClient> {
  let url: string;
  try {
    url = endpoint(options);
  } catch (error) {
    return Promise.reject(error);
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const socket = io(url, {
    auth: { token: options.token, ...(options.name && { name: options.name }) },
    transports: ["websocket"],
    reconnection: options.autoReconnect ?? true,
    timeout: timeoutMs,
    autoConnect: false,
  });
  const client = new CarbonClient(socket);
  return new Promise<CarbonClient>((resolve, reject) => {
    const settle = (error?: CarbonError) => {
      clearTimeout(timer);
      socket.off("hello", onHello).off("state", onState).off("connect_error", onError);
      if (!error) return resolve(client);
      socket.disconnect();
      reject(error);
    };
    const onHello = (hello: Hello) => {
      if (Math.trunc(hello?.protocolVersion) !== PROTOCOL_VERSION) {
        settle(new CarbonError("protocol_mismatch", `Carbon speaks remote protocol ${hello?.protocolVersion}; this SDK speaks ${PROTOCOL_VERSION}.`));
      }
    };
    const onState = () => settle();
    const onError = (error: Error) => settle(toCarbonError(error));
    const timer = setTimeout(() => settle(new CarbonError("timeout")), timeoutMs);
    socket.on("hello", onHello).on("state", onState).on("connect_error", onError);
    socket.connect();
  });
}
