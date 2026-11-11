// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hold } from "./hold";
import { HOLD_MS } from "./hold-timer";

let now = 0;
let frames: FrameRequestCallback[] = [];
const runFrames = (to: number) => {
  now = to;
  const pending = frames;
  frames = [];
  pending.forEach((f) => f(now));
};
const pointer = (type: string, x = 10, y = 10) => new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true });

beforeEach(() => {
  now = 0;
  frames = [];
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("hold action", () => {
  it("opens after the hold, shows progress on the way, and swallows the release's click", () => {
    const node = document.createElement("button");
    const onhold = vi.fn();
    const clicked = vi.fn();
    node.addEventListener("click", clicked);
    const action = hold(node, { onhold });
    expect(node.classList.contains("holdable")).toBe(true);

    node.dispatchEvent(pointer("pointerdown", 40, 50));
    runFrames(HOLD_MS / 2);
    expect(node.style.getPropertyValue("--hold")).toBe("0.5");
    expect(node.hasAttribute("data-holding")).toBe(true);
    runFrames(HOLD_MS);
    expect(onhold).toHaveBeenCalledWith({ x: 40, y: 50 }, node);
    expect(node.hasAttribute("data-holding")).toBe(false);

    node.dispatchEvent(pointer("pointerup"));
    node.dispatchEvent(pointer("click"));
    expect(clicked).not.toHaveBeenCalled();
    action.destroy();
  });

  it("lets a quick click through and never opens", () => {
    const node = document.createElement("button");
    const onhold = vi.fn();
    const clicked = vi.fn();
    node.addEventListener("click", clicked);
    hold(node, { onhold });
    node.dispatchEvent(pointer("pointerdown"));
    runFrames(80);
    node.dispatchEvent(pointer("pointerup"));
    node.dispatchEvent(pointer("click"));
    runFrames(HOLD_MS * 2);
    expect(onhold).not.toHaveBeenCalled();
    expect(clicked).toHaveBeenCalledOnce();
  });

  it("cancels when the pointer moves away or a drag starts", () => {
    const node = document.createElement("div");
    const onhold = vi.fn();
    hold(node, { onhold });
    node.dispatchEvent(pointer("pointerdown", 0, 0));
    node.dispatchEvent(pointer("pointermove", 30, 0));
    runFrames(HOLD_MS);
    node.dispatchEvent(pointer("pointerdown", 0, 0));
    node.dispatchEvent(new Event("dragstart"));
    runFrames(HOLD_MS * 3);
    expect(onhold).not.toHaveBeenCalled();
  });
});
