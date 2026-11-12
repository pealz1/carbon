import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IdleTimer } from "./idle";

describe("IdleTimer", () => {
  let states: boolean[];
  let timer: IdleTimer;

  beforeEach(() => {
    vi.useFakeTimers();
    states = [];
    timer = new IdleTimer(3_000, (idle) => states.push(idle));
  });

  afterEach(() => {
    timer.stop();
    vi.useRealTimers();
  });

  const last = () => states.at(-1);

  it("goes idle after the timeout without activity", () => {
    timer.wake();
    vi.advanceTimersByTime(2_999);
    expect(last()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(last()).toBe(true);
  });

  it("starts over on every wake", () => {
    timer.wake();
    vi.advanceTimersByTime(2_000);
    timer.wake();
    vi.advanceTimersByTime(2_000);
    expect(last()).toBe(false);
    vi.advanceTimersByTime(1_000);
    expect(last()).toBe(true);
  });

  it("wakes up when activity comes back", () => {
    timer.wake();
    vi.advanceTimersByTime(3_000);
    timer.wake();
    expect(last()).toBe(false);
  });

  it("never goes idle while something holds it", () => {
    timer.wake();
    timer.hold("hover", true);
    timer.hold("popover", true);
    vi.advanceTimersByTime(60_000);
    expect(last()).toBe(false);
    timer.hold("hover", false);
    vi.advanceTimersByTime(60_000);
    expect(last()).toBe(false);
  });

  it("waits the full timeout after the last hold lets go", () => {
    timer.hold("focus", true);
    vi.advanceTimersByTime(10_000);
    timer.hold("focus", false);
    vi.advanceTimersByTime(2_999);
    expect(last()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(last()).toBe(true);
  });

  it("shows again as soon as a hold starts", () => {
    timer.wake();
    vi.advanceTimersByTime(3_000);
    expect(last()).toBe(true);
    timer.hold("focus", true);
    expect(last()).toBe(false);
  });

  it("does nothing after stop", () => {
    timer.wake();
    timer.stop();
    vi.advanceTimersByTime(10_000);
    expect(last()).toBe(false);
  });
});
