// Which of the listener's own servers Carbon is signed in to. Sign-in, the saved session and every
// library call live in Rust (servers.rs); the webview only holds what it needs to load audio and
// artwork from the server.
import { invoke } from "@tauri-apps/api/core";
import { describeError } from "$lib/errors";
import type { ServerKind } from "./uri";

/** Mirrors `ServerInfo` in servers.rs. */
export interface ServerInfo {
  kind: ServerKind;
  url: string;
  username: string;
  /** Jellyfin's id for the signed-in user; "" on Subsonic. */
  userId: string;
  /** Appended to stream and artwork addresses so the server lets the webview load them. */
  mediaQuery: string;
}

export type Params = Record<string, string | number | boolean | undefined>;

/** One library call on a server, made (and signed) by Rust. */
export function serverGet<T>(kind: ServerKind, path: string, params: Params = {}): Promise<T> {
  const pairs = Object.entries(params)
    .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
    .map(([key, value]) => [key, String(value)]);
  return invoke<T>("server_get", { kind, path, params: pairs });
}

class ServerSession {
  list = $state<ServerInfo[]>([]);
  error = $state<string | null>(null);
  #loading: Promise<void> | null = null;

  of = (kind: ServerKind): ServerInfo | null => this.list.find((s) => s.kind === kind) ?? null;

  /** Reads the saved sessions once; later callers share the answer. */
  load(): Promise<void> {
    this.#loading ??= invoke<ServerInfo[]>("servers_connected").then(
      (list) => void (this.list = list),
      (e) => {
        console.error("[servers] load", e);
        this.error = describeError(e);
      },
    );
    return this.#loading;
  }

  /** Signs in and remembers the server. Throws a plain sentence when it can't. */
  async connect(kind: ServerKind, url: string, username: string, password: string): Promise<void> {
    const info = await invoke<ServerInfo>("server_connect", { kind, url, username, password });
    this.list = [...this.list.filter((s) => s.kind !== kind), info];
  }

  async disconnect(kind: ServerKind): Promise<void> {
    await invoke("server_disconnect", { kind });
    this.list = this.list.filter((s) => s.kind !== kind);
  }
}

export const serverSession = new ServerSession();
