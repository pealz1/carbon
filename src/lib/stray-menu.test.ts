// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { menu } from "./menu.svelte";
import { handleStrayContextMenu } from "./stray-menu";

function rightClick(el: Element, init: MouseEventInit = { clientX: 10, clientY: 20 }): MouseEvent {
  const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(event);
  handleStrayContextMenu(event);
  return event;
}

describe("stray right-clicks", () => {
  afterEach(() => {
    menu.close(false);
    document.body.replaceChildren();
    window.getSelection()?.removeAllRanges();
  });

  it("hides the browser menu on plain elements", () => {
    const div = document.body.appendChild(document.createElement("div"));
    expect(rightClick(div).defaultPrevented).toBe(true);
    expect(menu.current).toBeNull();
  });

  it("leaves text fields their own menu, but not sliders", () => {
    const text = document.body.appendChild(document.createElement("input"));
    const area = document.body.appendChild(document.createElement("textarea"));
    const range = document.body.appendChild(Object.assign(document.createElement("input"), { type: "range" }));
    expect(rightClick(text).defaultPrevented).toBe(false);
    expect(rightClick(area).defaultPrevented).toBe(false);
    expect(rightClick(range).defaultPrevented).toBe(true);
  });

  it("leaves Carbon's own menus alone", () => {
    const row = document.body.appendChild(document.createElement("div"));
    row.addEventListener("contextmenu", (e) => menu.open(e, ["separator"]));
    rightClick(row);
    expect(menu.current?.items).toEqual(["separator"]);
  });

  it("offers Copy for selected text, under the element for the Menu key", () => {
    const p = document.body.appendChild(document.createElement("p"));
    p.textContent = "hello there";
    p.getBoundingClientRect = () => ({ left: 40, bottom: 90 }) as DOMRect;
    window.getSelection()?.selectAllChildren(p);
    rightClick(p, { clientX: 0, clientY: 0 });
    expect(menu.current).toMatchObject({ x: 40, y: 90 });
    expect(menu.current?.items).toHaveLength(1);
  });
});
