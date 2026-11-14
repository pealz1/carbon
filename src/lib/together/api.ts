// Listen together: the relay's HTTP side (cloud/API.md, "Rooms"). Opening a room and looking one
// up; the room itself is a WebSocket (room.svelte.ts). Responses are validated before use.
import { CARBON } from "$lib/config";
import { isHostToken, MAX_NAME, normalizeCode } from "./protocol";

export class RoomError extends Error {
  constructor(
    readonly kind: "unreachable" | "not_found" | "busy" | "refused",
    message: string,
  ) {
    super(message);
  }
}

const UNREACHABLE = "Listening together isn't available right now: Carbon's room service can't be reached.";
const unreachable = () => new RoomError("unreachable", UNREACHABLE);

/** The relay's own sentence when it sent one (they are written for listeners), else ours. */
async function failure(res: Response): Promise<RoomError> {
  if (res.status === 404) return new RoomError("not_found", "That room doesn't exist or has ended. Check the code.");
  if (res.status === 429) return new RoomError("busy", "Too many tries just now. Wait a minute, then try again.");
  if (res.status >= 500) return unreachable();
  const body = (await res.json().catch(() => null)) as { error?: { message?: unknown } } | null;
  const message = body?.error?.message;
  return new RoomError("refused", typeof message === "string" && message.length <= 300 ? message : "The room service refused that.");
}

async function call(path: string, init?: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${CARBON.apiUrl}${path}`, init);
  } catch (e) {
    console.warn("[together] relay unreachable", e);
    throw unreachable();
  }
  if (!res.ok) throw await failure(res);
  return res.json().catch(() => null);
}

export async function createRoom(name: string): Promise<{ code: string; hostToken: string }> {
  const trimmed = name.trim().slice(0, MAX_NAME);
  const body = (await call("/v1/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(trimmed ? { name: trimmed } : {}),
  })) as { code?: unknown; hostToken?: unknown } | null;
  const code = typeof body?.code === "string" ? normalizeCode(body.code) : null;
  // A 2xx that isn't a room: something other than the room service answered.
  if (!code || !isHostToken(body?.hostToken)) throw unreachable();
  return { code, hostToken: body.hostToken };
}

/** Throws RoomError("not_found") when the room has ended. */
export async function lookupRoom(code: string): Promise<void> {
  await call(`/v1/rooms/${code}`);
}

export const socketUrl = (code: string): string => `${CARBON.apiUrl.replace(/^http/, "ws")}/v1/rooms/${code}/ws`;

export const describeRoomError = (e: unknown): string => (e instanceof RoomError ? e.message : "Something went wrong with the room. Try again.");
