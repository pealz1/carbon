// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { EMBED_ORIGIN, YoutubeEmbed } from "./embed";

function setup() {
  const embed = new YoutubeEmbed();
  const host = document.createElement("div");
  document.body.append(host);
  embed.mount(host);
  return { embed, host };
}

const frameIn = (host: HTMLElement) => host.querySelector("iframe")!;
const sent = (frame: HTMLIFrameElement) => vi.spyOn(frame.contentWindow!, "postMessage");
const commands = (spy: ReturnType<typeof sent>) => spy.mock.calls.map(([m]) => JSON.parse(m as string)).filter((m) => m.event === "command").map((m) => m.func);

function fromFrame(frame: HTMLIFrameElement, event: string, info: unknown) {
  window.dispatchEvent(new MessageEvent("message", { origin: EMBED_ORIGIN, source: frame.contentWindow, data: JSON.stringify({ event, info }) }));
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("YoutubeEmbed", () => {
  it("creates the frame on the first song and queues commands until the player is ready", () => {
    const { embed, host } = setup();
    embed.load("aaaaaaaaaaa");
    const frame = frameIn(host);
    expect(frame.src).toContain("/embed/aaaaaaaaaaa?");
    const spy = sent(frame);
    embed.pause();
    expect(commands(spy)).toEqual([]);
    fromFrame(frame, "onReady", null);
    expect(commands(spy)).toEqual(["addEventListener", "addEventListener", "pauseVideo"]);
    embed.load("bbbbbbbbbbb");
    expect(commands(spy).at(-1)).toBe("loadVideoById");
    expect(host.querySelectorAll("iframe")).toHaveLength(1);
  });

  it("ignores messages that don't come from its frame", () => {
    const { embed, host } = setup();
    const events: unknown[] = [];
    embed.onEvent((e) => events.push(e));
    embed.load("aaaaaaaaaaa");
    window.dispatchEvent(new MessageEvent("message", { origin: EMBED_ORIGIN, source: window, data: JSON.stringify({ event: "onReady" }) }));
    expect(events).toEqual([]);
    fromFrame(frameIn(host), "onReady", null);
    expect(events).toEqual([{ ready: true }]);
  });

  it("starts a fresh frame after its old home was removed (the layout re-rendered)", () => {
    const { embed, host } = setup();
    embed.load("aaaaaaaaaaa");
    fromFrame(frameIn(host), "onReady", null);
    host.remove();
    const next = document.createElement("div");
    document.body.append(next);
    embed.mount(next);
    embed.load("bbbbbbbbbbb");
    expect(frameIn(next).src).toContain("/embed/bbbbbbbbbbb?");
  });

  it("halts: resolves once the player reports it stopped, or after a short wait", async () => {
    const { embed, host } = setup();
    embed.load("aaaaaaaaaaa");
    const frame = frameIn(host);
    fromFrame(frame, "onReady", null);
    fromFrame(frame, "onStateChange", 1);
    let done = false;
    const halted = embed.halt().then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    fromFrame(frame, "onStateChange", 5);
    await halted;

    vi.useFakeTimers();
    fromFrame(frame, "onStateChange", 1);
    let late = false;
    const waiting = embed.halt().then(() => (late = true));
    await vi.advanceTimersByTimeAsync(1_000);
    await waiting;
    expect(late).toBe(true);
  });

  it("reports a player that never answers, then tries afresh", async () => {
    vi.useFakeTimers();
    const { embed, host } = setup();
    const events: unknown[] = [];
    embed.onEvent((e) => events.push(e));
    embed.load("aaaaaaaaaaa");
    await vi.advanceTimersByTimeAsync(15_000);
    expect(events).toEqual([{ error: -1 }]);
    expect(frameIn(host)).toBeNull();
    embed.load("bbbbbbbbbbb");
    expect(frameIn(host).src).toContain("bbbbbbbbbbb");
  });
});
