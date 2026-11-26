// @vitest-environment jsdom
import { flushSync, mount, unmount } from "svelte";
import { afterEach, expect, it, vi } from "vitest";

// @ts-expect-error The client build has no declaration file at this path.
vi.mock("svelte", () => import("../../../node_modules/svelte/src/index-client.js"));
vi.mock("$lib/volume-wheel", () => ({ wheelVolume: vi.fn() }));

class Player {
  volume = $state(0.38);
  setVolume = (value: number) => (this.volume = value);
}

const player = new Player();
vi.doMock("$lib/player.svelte", () => ({ player }));
const { default: VolumeControl } = await import("./VolumeControl.svelte");
let app: ReturnType<typeof mount>;

afterEach(async () => {
  await unmount(app);
  document.body.replaceChildren();
});

it("shows the current level and updates the visible and accessible percentages while dragging", () => {
  app = mount(VolumeControl, { target: document.body, props: { inline: true } });
  flushSync();
  const range = document.querySelector<HTMLInputElement>('input[type="range"]')!;
  expect(document.querySelector(".value")?.textContent).toBe("38%");

  range.value = "0.64";
  range.dispatchEvent(new Event("input", { bubbles: true }));
  flushSync();
  expect(document.querySelector(".value")?.textContent).toBe("64%");
  expect(range.getAttribute("aria-valuetext")).toBe("64%");

  range.dispatchEvent(new Event("change", { bubbles: true }));
  flushSync();
  const mute = document.querySelector<HTMLButtonElement>("button")!;
  mute.click();
  flushSync();
  expect(document.querySelector(".value")?.textContent).toBe("0%");
  mute.click();
  flushSync();
  expect(document.querySelector(".value")?.textContent).toBe("64%");
});
