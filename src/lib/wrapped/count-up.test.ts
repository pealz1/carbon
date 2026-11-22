import { expect, it } from "vitest";
import { countUp } from "./count-up";

it("starts at nothing and ends on the figure itself", () => {
  expect(countUp(12_480, 0, 1400)).toBe(0);
  expect(countUp(12_480, 1400, 1400)).toBe(12_480);
  expect(countUp(12_480, 9000, 1400)).toBe(12_480);
  expect(countUp(12_480, Infinity, 1400)).toBe(12_480);
});

it("waits at nothing before its turn, and skips a run with no length", () => {
  expect(countUp(87, -300, 1400)).toBe(0);
  expect(countUp(87, 0, 0)).toBe(87);
  expect(countUp(87, -300, 0)).toBe(87);
});

it("only ever climbs, in whole numbers, and slows towards the end", () => {
  const shown = Array.from({ length: 29 }, (_, frame) => countUp(1000, frame * 50, 1400));
  expect(shown.every(Number.isInteger)).toBe(true);
  expect(shown.every((value, i) => i === 0 || value >= shown[i - 1])).toBe(true);
  expect(shown.at(-1)).toBe(1000);
  expect(countUp(1000, 700, 1400)).toBe(875);
  expect(countUp(0, 700, 1400)).toBe(0);
});
