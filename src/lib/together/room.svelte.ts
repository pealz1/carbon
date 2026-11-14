// Listen together: the room this Carbon is in. Nobody's audio is relayed: the host's Carbon says
// what it plays and where it is, and each guest's Carbon plays that song from the guest's own
// account. The rules live in sync.ts; this wires them to the relay's socket and the real player
// (through its public API only), and never fights a listener who pauses, seeks or picks a song.
import { untrack } from "svelte";
import { player } from "$lib/player.svelte";
import { services } from "$lib/services.svelte";
import { createRoom, describeRoomError, lookupRoom, RoomError, socketUrl } from "./api";
import { CLOSE, encode, normalizeCode, parseServerMessage, serviceOf, type ClientMessage, type CloseReason, type HostState, type Role, type ServerMessage } from "./protocol";
import { clockOffset, clockSample, decide, guestNotice, hostState, listenerActed, worthSending, type Action, type ClockSample, type Local, type Playing } from "./sync";

const TICK_MS = 1_000;
/** After Carbon pauses, resumes or seeks for the room, the player is left alone this long to catch up. */
const SETTLE_MS = 4_000;
const SEEK_COOLDOWN_MS = 10_000;
/** A started song must be seen playing; Spotify may play its own copy under another uri, accepted after this long. */
const START_SETTLE_MS = 2_500;
const START_TIMEOUT_MS = 15_000;
/**
 * However fast the host changes songs, a guest asks its own service to play at most twice in this
 * long (a skip right after a song starts stays instant; a flood doesn't get through). The latest song wins.
 */
const START_WINDOW_MS = 10_000;
const STARTS_PER_WINDOW = 2;
/** The host never sends faster than the relay's rate limit refills (2 a second). */
const MIN_SEND_GAP_MS = 500;
/** A few quick pings to learn the clock, then one now and then. */
const FAST_PINGS = 5;
const PING_EVERY_MS = 30_000;
const MAX_SAMPLES = 8;
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 30_000;
const RETRY_JITTER_MS = 500;

const CLOSED: Record<CloseReason, string> = {
  ended: "The host ended the room.",
  host_left: "The host left, so the room closed.",
  expired: "The room closed after sitting idle.",
};

/** This Carbon's clock: wall time that never steps backwards. */
const clock = (): number => performance.timeOrigin + performance.now();

interface Start {
  uri: string;
  at: number;
  /** What was playing before, to tell the new song from the old. */
  from: string | null;
  /** When the player accepted the request. */
  readyAt: number | null;
}

class Together {
  role = $state<Role | null>(null);
  code = $state<string | null>(null);
  phase = $state<"idle" | "connecting" | "live" | "reconnecting">("idle");
  busy = $state(false);
  /** Everyone connected, host included. */
  members = $state(0);
  hostName = $state<string | null>(null);
  /** Guests: what the host last said. */
  host = $state<HostState | null>(null);
  /** Guests: false once the listener paused, seeked or picked a song on their own, until Resync. */
  synced = $state(true);
  /** Guests: why following isn't possible right now, as a sentence. */
  notice = $state<string | null>(null);
  error = $state<string | null>(null);

  #token: string | null = null;
  #socket: WebSocket | null = null;
  #timer: ReturnType<typeof setInterval> | undefined;
  #retryTimer: ReturnType<typeof setTimeout> | undefined;
  #stopWatching: (() => void) | null = null;
  #attempt = 0;
  #samples: ClockSample[] = [];
  #pings = 0;
  #pingAt = 0;
  #sent: HostState | null = null;
  #before: { local: Local; at: number } | null = null;
  #settleUntil = 0;
  #seekAt = -Infinity;
  #starting: Start | null = null;
  /** A song that wouldn't start here: not retried until the host moves on or the listener asks. */
  #failedUri: string | null = null;
  /** Spotify played its own copy of the host's song (track relinking): the two count as the same. */
  #alias: { host: string; local: string } | null = null;

  start = async (name: string): Promise<void> => {
    await this.#enter(async () => {
      const room = await createRoom(name);
      this.#token = room.hostToken;
      return { role: "host", code: room.code };
    });
  };

  join = async (text: string): Promise<void> => {
    const code = normalizeCode(text);
    if (!code) return void (this.error = "Enter the 6-character room code.");
    await this.#enter(async () => {
      await lookupRoom(code);
      return { role: "guest", code };
    });
  };

  /** A guest leaves; the host ends the room for everyone. Whatever is playing keeps playing. */
  leave = (): void => {
    if (this.role === "host") this.#send({ type: "end" });
    this.#reset();
  };

  /** Back in step with the host, at the listener's request. */
  resync = (): void => {
    this.synced = true;
    this.error = null;
    this.#failedUri = null;
    this.#before = null;
    this.#seekAt = -Infinity;
    this.#follow();
  };

  async #enter(open: () => Promise<{ role: Role; code: string }>): Promise<void> {
    if (this.role || this.busy) return;
    this.busy = true;
    this.error = null;
    try {
      const { role, code } = await open();
      this.role = role;
      this.code = code;
      this.phase = "connecting";
      this.#begin();
    } catch (e) {
      if (!(e instanceof RoomError)) console.error("[together]", e);
      this.#finish(describeRoomError(e));
    } finally {
      this.busy = false;
    }
  }

  #begin(): void {
    addEventListener("pagehide", this.leave); // the window is closing: leave cleanly
    this.#timer = setInterval(() => this.#tick(), TICK_MS);
    this.#stopWatching = $effect.root(() => {
      $effect(() => {
        // The host says so at once when the song, pause or speed changes; seeks and heartbeats ride the tick.
        void [player.track?.uri, player.paused, player.clockRate];
        untrack(() => this.#share());
      });
    });
    this.#connect();
  }

  #connect(): void {
    if (!this.code) return;
    const socket = new WebSocket(socketUrl(this.code));
    this.#socket = socket;
    socket.onopen = () => this.#socket === socket && this.#opened();
    socket.onmessage = (event) => this.#socket === socket && this.#receive(event.data);
    socket.onclose = (event) => this.#socket === socket && this.#dropped(event.code);
  }

  #opened(): void {
    this.#samples = [];
    this.#pings = 0;
    this.#sent = null;
    if (this.#token) this.#send({ type: "hello", token: this.#token });
    this.#ping();
  }

  #receive(data: unknown): void {
    const message = parseServerMessage(data);
    if (!message) return console.warn("[together] ignored a malformed message from the relay");
    switch (message.type) {
      case "welcome":
        return this.#welcomed(message);
      case "state":
        return this.#heard(message.state);
      case "members":
        return void (this.members = message.count);
      case "pong":
        return this.#ponged(message.t, message.now);
      case "closed":
        return this.#finish(CLOSED[message.reason]);
      case "error":
        if (message.code === "bad_token") return this.#finish("This room can't be hosted from here any more.");
        return console.warn("[together] the relay refused a message:", message.code);
    }
  }

  #welcomed(message: Extract<ServerMessage, { type: "welcome" }>): void {
    if (message.role !== this.role) return; // a host is greeted as a guest first, then as the host
    this.phase = "live";
    this.#attempt = 0;
    this.members = message.members;
    this.hostName = message.hostName;
    if (this.role === "guest") this.#heard(message.state);
    else this.#share();
  }

  #heard(state: HostState | null): void {
    if (this.role !== "guest") return;
    this.host = state;
    this.#follow();
  }

  #ponged(sentAt: number, relayNow: number): void {
    const sample = clockSample(sentAt, relayNow, clock());
    if (!sample) return;
    this.#samples = [...this.#samples.slice(1 - MAX_SAMPLES), sample];
    if (this.role === "host") this.#share();
    else this.#follow();
  }

  #tick(): void {
    if (this.#socket?.readyState !== WebSocket.OPEN) return;
    if (this.#pings < FAST_PINGS || performance.now() - this.#pingAt >= PING_EVERY_MS) this.#ping();
    if (this.role === "host") this.#share();
    else this.#follow();
  }

  #ping(): void {
    this.#pings++;
    this.#pingAt = performance.now();
    this.#send({ type: "ping", t: clock() });
  }

  /** The relay's clock, once a pong has said how far ours is from it. */
  #relayNow(): number | null {
    const offset = clockOffset(this.#samples);
    return offset === null ? null : clock() + offset;
  }

  // ── host ──

  #share(): void {
    const relayNow = this.#relayNow();
    if (this.role !== "host" || relayNow === null || this.#socket?.readyState !== WebSocket.OPEN) return;
    const next = hostState(this.#playing(), relayNow);
    if (!worthSending(this.#sent, next) || (this.#sent && next.sentAt - this.#sent.sentAt < MIN_SEND_GAP_MS)) return;
    this.#sent = next;
    this.#send({ type: "state", ...next });
  }

  #playing(): Playing | null {
    const track = player.track;
    if (!track) return null;
    return {
      uri: track.uri,
      title: track.name,
      artists: track.artists.map((artist) => artist.name),
      durationMs: track.durationMs,
      positionMs: player.position(),
      paused: player.paused,
      rate: player.clockRate,
    };
  }

  // ── guest ──

  #follow(): void {
    const host = this.host;
    const relayNow = this.#relayNow();
    if (this.role !== "guest" || !host || relayNow === null) return;
    const local = this.#local();
    const connected = { spotify: services.active.spotify, youtube: services.active.youtube };
    this.notice = guestNotice(host, this.hostName, connected, local.uri === host.uri ? local.rate : host.rate);
    const service = serviceOf(host.uri);
    if (!service || !connected[service]) return void (this.#before = null);
    const now = performance.now();
    if (this.#starting) return this.#watchStart(this.#starting, host, now);
    if (now < this.#settleUntil) return void (this.#before = null);
    if (this.synced && this.#before && listenerActed(this.#before.local, local, now - this.#before.at, host, relayNow)) this.synced = false;
    this.#before = { local, at: now };
    if (this.synced) this.#apply(decide(host, local, relayNow), now);
  }

  #local(): Local {
    const uri = player.track?.uri ?? null;
    const alias = this.#alias;
    return { uri: alias && uri === alias.local ? alias.host : uri, positionMs: player.position(), paused: player.paused, rate: player.clockRate };
  }

  #apply(action: Action, now: number): void {
    if (action.do === "none") return;
    if (action.do === "play") {
      const recent = this.#starts.filter((at) => now >= at && now - at < START_WINDOW_MS);
      if (action.uri === this.#failedUri || recent.length >= STARTS_PER_WINDOW) return; // the next tick asks again
      this.#starts = [...recent, now];
      return void this.#start(action.uri, now);
    }
    if (action.do === "seek") {
      if (now - this.#seekAt < SEEK_COOLDOWN_MS) return;
      this.#seekAt = now;
      void player.seek(action.ms);
    } else if (player.paused === (action.do === "resume")) {
      void player.togglePlay();
    }
    this.#settleUntil = now + SETTLE_MS;
    this.#before = null;
  }

  /** When this guest last asked its service to play something. */
  #starts: number[] = [];

  /** Plays the host's song from this listener's own account. The seek to the host's position follows once it plays. */
  async #start(uri: string, now: number): Promise<void> {
    const start: Start = { uri, at: now, from: player.track?.uri ?? null, readyAt: null };
    this.#starting = start;
    this.#failedUri = null;
    this.error = null;
    this.#before = null;
    const ok = await player.playTracks([uri]);
    if (this.#starting !== start) return; // left the room, or the host moved on meanwhile
    if (ok === false) return this.#startFailed(uri);
    start.readyAt = performance.now();
  }

  #watchStart(start: Start, host: HostState, now: number): void {
    const playing = player.paused ? null : (player.track?.uri ?? null);
    const settled = start.readyAt !== null && now - start.readyAt >= START_SETTLE_MS;
    const landed = start.readyAt !== null && playing !== null && (playing === start.uri || (playing !== start.from && settled));
    if (landed || host.uri !== start.uri) {
      if (landed && playing && playing !== start.uri) this.#alias = { host: start.uri, local: playing };
      this.#starting = null;
      this.#seekAt = -Infinity;
      return this.#follow();
    }
    if (now - start.at > START_TIMEOUT_MS) this.#startFailed(start.uri);
  }

  #startFailed(uri: string): void {
    this.#starting = null;
    this.#failedUri = uri;
    this.error = "Couldn't play this song here. Carbon will try again with the host's next one.";
  }

  // ── connection ──

  #send(message: ClientMessage): void {
    if (this.#socket?.readyState === WebSocket.OPEN) this.#socket.send(encode(message));
  }

  /** The socket closed without Carbon asking: say why, or try again with a growing wait. */
  #dropped(code: number): void {
    this.#socket = null;
    if (code === CLOSE.ended) return this.#finish("The room has ended.");
    if (code === CLOSE.replaced) return this.#finish("This room is now hosted from another Carbon window.");
    if (code === CLOSE.full) return this.#finish("This room is full.");
    this.phase = "reconnecting";
    const wait = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** this.#attempt++) + Math.random() * RETRY_JITTER_MS;
    this.#retryTimer = setTimeout(() => void this.#reconnect(), wait);
  }

  /** Asks whether the room still exists first: a socket that fails to open can't say why. */
  async #reconnect(): Promise<void> {
    const code = this.code;
    if (!code) return;
    const gone = await lookupRoom(code).then(
      () => null,
      (e: unknown) => e,
    );
    if (this.code !== code || this.#socket) return;
    if (gone instanceof RoomError && gone.kind === "not_found") return this.#finish("The room has ended.");
    if (gone) return this.#dropped(0);
    this.#connect();
  }

  #finish(message: string): void {
    this.#reset();
    this.error = message;
  }

  #reset(): void {
    this.#starts = []; // a new room starts with a clean allowance
    removeEventListener("pagehide", this.leave);
    clearInterval(this.#timer);
    clearTimeout(this.#retryTimer);
    this.#stopWatching?.();
    this.#stopWatching = null;
    const socket = this.#socket;
    this.#socket = null;
    socket?.close(1000);
    this.role = this.code = this.hostName = this.host = this.notice = this.error = null;
    this.phase = "idle";
    this.members = 0;
    this.synced = true;
    this.#token = this.#sent = this.#before = this.#starting = this.#failedUri = this.#alias = null;
    this.#attempt = this.#settleUntil = 0;
    this.#samples = [];
    this.#seekAt = -Infinity;
  }
}

export const together = new Together();
