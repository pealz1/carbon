import { describe, expect, it } from "vitest";
import { HOLD_MS, HoldTimer } from "./hold-timer";

describe("HoldTimer", () => {
  it("completes once at the hold time", () => {
    const timer = new HoldTimer();
    timer.begin(1000, 10, 10);
    expect(timer.tick(1000 + HOLD_MS - 1)).toBe(false);
    expect(timer.tick(1000 + HOLD_MS)).toBe(true);
    expect(timer.tick(1000 + HOLD_MS + 50)).toBe(false);
    expect(timer.end()).toBe(true);
  });

  it("reports progress from 0 to 1 while held", () => {
    const timer = new HoldTimer(400);
    expect(timer.progress(0)).toBeNull();
    timer.begin(0, 0, 0);
    expect(timer.progress(0)).toBe(0);
    expect(timer.progress(100)).toBeCloseTo(0.25);
    expect(timer.progress(900)).toBe(1);
  });

  it("does nothing when released early", () => {
    const timer = new HoldTimer();
    timer.begin(0, 0, 0);
    expect(timer.end()).toBe(false);
    expect(timer.tick(HOLD_MS * 2)).toBe(false);
    expect(timer.progress(HOLD_MS)).toBeNull();
  });

  it("tolerates a small wobble but cancels on a real move", () => {
    const timer = new HoldTimer(450, 8);
    timer.begin(0, 100, 100);
    expect(timer.move(104, 105)).toBe(true);
    expect(timer.move(110, 100)).toBe(false);
    expect(timer.tick(1000)).toBe(false);
  });

  it("can be cancelled from outside (scroll, drag, context menu)", () => {
    const timer = new HoldTimer();
    timer.begin(0, 0, 0);
    timer.cancel();
    expect(timer.holding).toBe(false);
    expect(timer.tick(HOLD_MS)).toBe(false);
  });

  it("starts fresh on the next press", () => {
    const timer = new HoldTimer();
    timer.begin(0, 0, 0);
    timer.tick(HOLD_MS);
    timer.end();
    timer.begin(5000, 0, 0);
    expect(timer.tick(5000 + HOLD_MS / 2)).toBe(false);
    expect(timer.end()).toBe(false);
  });
});
