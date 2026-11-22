// @vitest-environment jsdom
import { createRawSnippet, flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Slide } from "./Story.svelte";

// The story's chrome, clock and keys, mounted for real. What it borrows from the app (whether the
// window can be seen, the motion settings, colours read from artwork) is stood in for here.
// Vitest resolves "svelte" to its server build (vite.config.js sets no `browser` condition for
// tests), and that build can't mount: this test asks for the client build by path instead.
// @ts-expect-error The client build has no declaration file at this path.
vi.mock("svelte", () => import("../../../node_modules/svelte/src/index-client.js"));

class Screen {
  current = $state(true);
}
const screen = new Screen();
vi.doMock("$lib/on-screen.svelte", () => ({ onScreen: screen }));
vi.doMock("$lib/preferences.svelte", () => ({ prefs: { effects: "full", motion: "normal" } }));
vi.doMock("$lib/art-tones.svelte", () => ({ artTones: () => ({ current: null }) }));
// jsdom has no media queries, and may not open dialogs.
window.matchMedia ??= ((media: string) => ({ media, matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
  this.setAttribute("open", "");
};

const { default: Story } = await import("./Story.svelte");

const SLIDE_MS = 6000;
const slides: Slide[] = ["a", "b", "c"].map((id) => ({ id, image: null }));
const slide = createRawSnippet<[Slide]>((current) => ({ render: () => `<section data-slide="${current().id}"><button class="inside">Act</button></section>` }));

let story: ReturnType<typeof mount> | undefined;
let props = $state({ slides, chapter: 2026, label: "Your year", onclose: vi.fn(), slide });

const find = <T extends HTMLElement = HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;
const shown = () => find("[data-slide]").dataset.slide;
const fills = () => [...document.querySelectorAll<HTMLElement>(".fill")].map((el) => Number(/scaleX\((.+)\)/.exec(el.style.transform)?.[1]));
const wait = (ms: number) => (vi.advanceTimersByTime(ms), flushSync());
const press = (key: string, target: Element = find("dialog")) => {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  flushSync();
  return event;
};
const pointer = (type: string, target: Element, at = 0) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "timeStamp", { value: at });
  target.dispatchEvent(event);
  flushSync();
};
const click = (selector: string) => (find(selector).click(), flushSync());

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  screen.current = true;
  props = { slides, chapter: 2026, label: "Your year", onclose: vi.fn(), slide };
  story = mount(Story, { target: document.body, props });
  flushSync();
});

afterEach(() => {
  if (story) void unmount(story);
  vi.useRealTimers();
});

describe("Story", () => {
  it("opens over the app on its first slide, with focus on the story itself", () => {
    const dialog = find<HTMLDialogElement>("dialog");
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(dialog.getAttribute("aria-label")).toBe("Your year");
    expect(document.activeElement).toBe(dialog);
    expect(shown()).toBe("a");
    expect(fills()).toEqual([0, 0, 0]);
    expect(find(".progress").getAttribute("aria-label")).toBe("Slide 1 of 3");
  });

  it("fills the slide's segment as its time runs, then moves on by itself", () => {
    wait(SLIDE_MS / 2);
    expect(fills()[0]).toBeGreaterThan(0.45);
    expect(fills()[0]).toBeLessThan(0.55);
    expect(shown()).toBe("a");
    wait(SLIDE_MS / 2 + 200);
    expect(shown()).toBe("b");
    expect(fills()[0]).toBe(1);
    expect(fills()[1]).toBeLessThan(0.1);
  });

  it("stays on the last slide when its time is up", () => {
    wait(SLIDE_MS * 4);
    expect(shown()).toBe("c");
    expect(fills()).toEqual([1, 1, 1]);
    expect(props.onclose).not.toHaveBeenCalled();
    click(".zone.on");
    expect(shown()).toBe("c");
  });

  it("goes on with the right arrow and Space, and back with the left arrow", () => {
    expect(press("ArrowRight").defaultPrevented).toBe(true);
    expect(shown()).toBe("b");
    expect(press(" ").defaultPrevented).toBe(true);
    expect(shown()).toBe("c");
    press("ArrowLeft");
    expect(shown()).toBe("b");
    press("ArrowLeft");
    press("ArrowLeft");
    expect(shown()).toBe("a");
    expect(press("x").defaultPrevented).toBe(false);
    expect(shown()).toBe("a");
  });

  it("leaves Space to the button that has focus", () => {
    expect(press(" ", find(".inside")).defaultPrevented).toBe(false);
    expect(shown()).toBe("a");
  });

  it("takes a tap on the right two thirds as on, and on the left third as back", () => {
    click(".zone.on");
    expect(shown()).toBe("b");
    wait(1000);
    click(".zone.back");
    expect(shown()).toBe("a");
    expect(fills()[0]).toBe(0);
    expect(find(".zone.back").getAttribute("aria-label")).toBe("Previous");
    expect(find(".zone.on").getAttribute("aria-label")).toBe("Next");
  });

  it("stands still while the pointer is held down, and doesn't count the release as a tap", () => {
    wait(1000);
    const before = fills()[0];
    pointer("pointerdown", find(".zone.on"), 0);
    wait(SLIDE_MS * 2);
    expect(shown()).toBe("a");
    expect(fills()[0]).toBe(before);
    pointer("pointerup", find(".zone.on"), SLIDE_MS * 2);
    click(".zone.on");
    expect(shown()).toBe("a");
    wait(1000);
    expect(fills()[0]).toBeGreaterThan(before);
    // A quick press and release is a tap.
    pointer("pointerdown", find(".zone.on"), 20_000);
    pointer("pointerup", find(".zone.on"), 20_080);
    click(".zone.on");
    expect(shown()).toBe("b");
  });

  it("stands still while the pointer rests on a control", () => {
    pointer("pointerover", find("[aria-label='Close']"));
    wait(SLIDE_MS * 2);
    expect(shown()).toBe("a");
    pointer("pointerout", find("[aria-label='Close']"));
    wait(SLIDE_MS + 200);
    expect(shown()).toBe("b");
    // Not over the tap zones: they are the stage, not a control.
    pointer("pointerover", find(".zone.on"));
    wait(SLIDE_MS + 200);
    expect(shown()).toBe("c");
  });

  it("pauses and plays from its button", () => {
    click("[aria-label='Pause']");
    wait(SLIDE_MS * 2);
    expect(shown()).toBe("a");
    expect(fills()[0]).toBe(0);
    click("[aria-label='Play']");
    wait(SLIDE_MS + 200);
    expect(shown()).toBe("b");
  });

  it("stops its clock while the window can't be seen", () => {
    screen.current = false;
    flushSync();
    wait(SLIDE_MS * 2);
    expect(shown()).toBe("a");
    screen.current = true;
    flushSync();
    wait(SLIDE_MS + 200);
    expect(shown()).toBe("b");
  });

  it("asks to close on Esc and from its button, without closing itself", () => {
    const cancel = new Event("cancel", { cancelable: true });
    find("dialog").dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(props.onclose).toHaveBeenCalledTimes(1);
    click("[aria-label='Close']");
    expect(props.onclose).toHaveBeenCalledTimes(2);
    expect(find("dialog").hasAttribute("open")).toBe(true);
  });

  it("starts again from the first slide for another year", () => {
    press("ArrowRight");
    wait(1000);
    props.chapter = 2025;
    flushSync();
    expect(shown()).toBe("a");
    expect(fills()).toEqual([0, 0, 0]);
  });

  it("gives focus back to where it was when it goes", () => {
    void unmount(story!);
    story = undefined;
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const again = mount(Story, { target: document.body, props });
    flushSync();
    expect(document.activeElement).toBe(find("dialog"));
    void unmount(again);
    flushSync();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
