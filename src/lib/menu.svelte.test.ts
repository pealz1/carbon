// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { coverFromFile } from "./cover";
import { menu } from "./menu.svelte";
import { Pager } from "./pager.svelte";

describe("menu", () => {
  afterEach(() => menu.close(false));

  it("opens at the pointer for a right-click and remembers where focus was", () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const event = new MouseEvent("contextmenu", { clientX: 120, clientY: 80, cancelable: true });
    menu.open(event, ["separator"]);
    expect(event.defaultPrevented).toBe(true);
    expect(menu.current).toMatchObject({ x: 120, y: 80, returnTo: trigger });
    const focus = vi.spyOn(trigger, "focus");
    menu.close();
    expect(menu.current).toBeNull();
    expect(focus).toHaveBeenCalled();
  });

  it("opens under the button for clicks and the keyboard", () => {
    const button = document.createElement("button");
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue({ left: 30, bottom: 64 } as DOMRect);
    const event = new KeyboardEvent("keydown", { key: "Enter", cancelable: true });
    Object.defineProperty(event, "currentTarget", { value: button });
    menu.open(event, []);
    expect(menu.current).toMatchObject({ x: 30, y: 64 });
  });
});

describe("Pager", () => {
  it("appends pages until there are no more, and reports errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ items: [1, 2], total: 3, nextOffset: 2 })
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ items: [3], total: 3, nextOffset: null });
    const pager = new Pager<number>(fetchPage);
    await pager.more();
    expect(pager.items).toEqual([1, 2]);
    await pager.more();
    expect(pager.error).toBe("offline");
    await pager.more();
    expect(pager).toMatchObject({ items: [1, 2, 3], total: 3, done: true, error: null });
    await pager.more();
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });
});

describe("coverFromFile", () => {
  const file = (type = "image/png") => new File([new Uint8Array(10)], "cover", { type });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("refuses files that aren't images", async () => {
    await expect(coverFromFile(file("text/plain"))).rejects.toThrow(/JPEG, PNG/);
  });

  it("explains images it can't decode", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => Promise.reject(new Error("bad"))));
    await expect(coverFromFile(file())).rejects.toThrow(/couldn't read/);
  });

  it("crops, scales and encodes a decoded image", async () => {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1200, height: 800, close })));
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,QUJD");
    expect(await coverFromFile(file())).toBe("QUJD");
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 200, 0, 800, 800, 0, 0, 640, 640);
    expect(close).toHaveBeenCalled();
  });

  it("explains when there's no canvas to draw on", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 10, height: 10, close: vi.fn() })));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    await expect(coverFromFile(file())).rejects.toThrow(/couldn't prepare/);
  });
});
