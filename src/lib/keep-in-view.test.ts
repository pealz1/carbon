import { expect, it } from "vitest";
import { nudge } from "./keep-in-view";

it("leaves a panel that already fits where it is", () => {
  expect(nudge(100, 200, 1000)).toBe(0);
});
it("pulls a panel back from the right or bottom edge", () => {
  expect(nudge(900, 200, 1000)).toBe(-108);
});
it("pushes a panel in from the left or top edge", () => {
  expect(nudge(-30, 200, 1000)).toBe(38);
});
it("pins a panel bigger than the window to its start, so its top stays reachable", () => {
  expect(nudge(40, 1200, 1000)).toBe(-32);
});
