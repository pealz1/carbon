// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const win = { setFullscreen: vi.fn(async () => {}), isFullscreen: vi.fn(async () => true) };
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => win }));
vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("$lib/spotify/endpoints", () => ({ isSaved: vi.fn(), save: vi.fn(), unsave: vi.fn() }));
vi.mock("$lib/player.svelte", () => ({
  player: {
    track: { uri: "spotify:track:now" } as { uri: string } | null,
    volume: 0.5,
    togglePlay: vi.fn(),
    previous: vi.fn(),
    next: vi.fn(),
    setVolume: vi.fn(),
  },
}));

const { player } = await import("$lib/player.svelte");
const { dialogs } = await import("./dialogs.svelte");
const { menu } = await import("./menu.svelte");
const { saved } = await import("./saved.svelte");
const { toasts } = await import("./toast.svelte");
const { view } = await import("./view.svelte");
const { handleKey } = await import("./keyboard");
const { isActivatable, isTyping, matchShortcut } = await import("./shortcuts");

const key = (init: KeyboardEventInit & { key: string }, target: EventTarget = document.body) => {
  const event = new KeyboardEvent("keydown", { cancelable: true, ...init });
  Object.defineProperty(event, "target", { value: target });
  handleKey(event);
  return event;
};

describe("matchShortcut", () => {
  const press = (key: string, mods: Partial<Record<"ctrlKey" | "shiftKey" | "altKey" | "metaKey", boolean>> = {}) =>
    matchShortcut({ key, ctrlKey: false, shiftKey: false, altKey: false, ...mods });

  it("maps the documented keys", () => {
    expect(press(" ")).toBe("toggle-play");
    expect(press("ArrowLeft", { ctrlKey: true })).toBe("previous");
    expect(press("ArrowRight", { metaKey: true })).toBe("next");
    expect(press("ArrowUp", { ctrlKey: true })).toBe("volume-up");
    expect(press("ArrowDown", { ctrlKey: true })).toBe("volume-down");
    expect(press("L", { ctrlKey: true })).toBe("like");
    expect(press("k", { ctrlKey: true })).toBe("palette");
    expect(press("F11")).toBe("fullscreen");
    expect(press("C", { ctrlKey: true, shiftKey: true })).toBe("cinema");
    expect(press("?", { shiftKey: true })).toBe("shortcuts");
    expect(press("Escape")).toBe("escape");
    expect(press("l")).toBe("loop");
  });

  it("ignores everything else", () => {
    expect(press("ArrowLeft")).toBeNull();
    expect(press(" ", { shiftKey: true })).toBeNull();
    expect(press("k", { ctrlKey: true, altKey: true })).toBeNull();
    expect(press("x", { ctrlKey: true })).toBeNull();
    expect(press("x", { ctrlKey: true, shiftKey: true })).toBeNull();
    expect(press("F11", { ctrlKey: true })).toBeNull();
    expect(press("a")).toBeNull();
    expect(press("L", { shiftKey: true })).toBeNull();
  });
});

describe("focus rules", () => {
  it("knows text fields from switches and sliders", () => {
    const text = document.createElement("input");
    const range = Object.assign(document.createElement("input"), { type: "range" });
    expect(isTyping(text)).toBe(true);
    expect(isTyping(document.createElement("textarea"))).toBe(true);
    expect(isTyping(range)).toBe(false);
    expect(isTyping(document.body)).toBe(false);
    expect(isTyping(null)).toBe(false);
    expect(isActivatable(document.createElement("button"))).toBe(true);
    expect(isActivatable(document.body)).toBe(false);
  });
});

describe("handleKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dialogs.shortcuts = false;
    menu.current = null;
    view.cinema = false;
    view.fullscreen = false;
  });
  afterEach(() => (toasts.items = []));

  it("runs playback shortcuts and claims the key", () => {
    expect(key({ key: " " }).defaultPrevented).toBe(true);
    expect(player.togglePlay).toHaveBeenCalled();
    key({ key: "ArrowLeft", ctrlKey: true });
    key({ key: "ArrowRight", ctrlKey: true });
    expect(player.previous).toHaveBeenCalled();
    expect(player.next).toHaveBeenCalled();
    key({ key: "ArrowUp", ctrlKey: true, repeat: true });
    expect(player.setVolume).toHaveBeenCalledWith(0.55);
    key({ key: "ArrowDown", ctrlKey: true });
    expect(player.setVolume).toHaveBeenLastCalledWith(0.45);
  });

  it("leaves keys alone where they mean something else", () => {
    expect(key({ key: " " }, document.createElement("button")).defaultPrevented).toBe(false);
    expect(key({ key: "ArrowLeft", ctrlKey: true }, document.createElement("input")).defaultPrevented).toBe(false);
    expect(key({ key: "ArrowRight", ctrlKey: true, repeat: true }).defaultPrevented).toBe(false);
    expect(key({ key: "Escape" }).defaultPrevented).toBe(false);
    dialogs.shortcuts = true;
    expect(key({ key: " " }).defaultPrevented).toBe(false);
    dialogs.shortcuts = false;
    menu.current = { x: 0, y: 0, items: [], returnTo: null };
    expect(key({ key: " " }).defaultPrevented).toBe(false);
    expect(player.togglePlay).not.toHaveBeenCalled();
  });

  it("opens the command palette and the shortcuts sheet", () => {
    key({ key: "k", ctrlKey: true });
    expect(dialogs.palette).toBe(true);
    dialogs.palette = false;
    key({ key: "?", shiftKey: true });
    expect(dialogs.shortcuts).toBe(true);
  });

  it("likes the current song and says so", async () => {
    vi.mocked(await import("$lib/spotify/endpoints")).save.mockResolvedValue(undefined);
    saved.remember(["spotify:track:now"], false);
    key({ key: "l", ctrlKey: true });
    await vi.waitFor(() => expect(toasts.items.at(-1)?.text).toBe("Saved to Liked Songs."));
  });

  it("toggles full screen even from a text field", async () => {
    key({ key: "F11" }, document.createElement("input"));
    await vi.waitFor(() => expect(view.fullscreen).toBe(true));
    expect(win.setFullscreen).toHaveBeenCalledWith(true);
  });

  it("enters cinema in full screen and Esc restores the window", async () => {
    key({ key: "C", ctrlKey: true, shiftKey: true });
    await vi.waitFor(() => expect(view.fullscreen).toBe(true));
    expect(view.cinema).toBe(true);
    key({ key: "Escape" });
    await vi.waitFor(() => expect(view.fullscreen).toBe(false));
    expect(view.cinema).toBe(false);
  });

  it("leaves full screen alone if it was already on before cinema", async () => {
    view.fullscreen = true;
    await view.toggleCinema();
    await view.toggleCinema();
    expect(view.fullscreen).toBe(true);
    expect(win.setFullscreen).not.toHaveBeenCalled();
    key({ key: "k", ctrlKey: true });
    expect(dialogs.palette).toBe(true);
    dialogs.palette = false;
  });
});

describe("view", () => {
  it("reads the real full screen state and reports failures", async () => {
    await view.syncFullscreen();
    expect(view.fullscreen).toBe(true);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    win.isFullscreen.mockRejectedValueOnce(new Error("gone"));
    await view.syncFullscreen();
    win.setFullscreen.mockRejectedValueOnce(new Error("not allowed"));
    await view.setFullscreen(false);
    expect(view.fullscreen).toBe(true);
    expect(toasts.items.at(-1)?.text).toMatch(/not allowed/);
  });
});
