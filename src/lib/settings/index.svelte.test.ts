// @vitest-environment jsdom
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SettingsIndex } from "./index.svelte";
import { matchSettings } from "./search";

// Rows listing themselves for search, mounted for real. Vitest resolves "svelte" to its server
// build, which can't mount: this test asks for the client build by path instead.
// @ts-expect-error The client build has no declaration file at this path.
vi.mock("svelte", () => import("../../../node_modules/svelte/src/index-client.js"));

const { default: Fixture } = await import("./IndexFixture.svelte");
const { default: Toggle } = await import("$lib/components/Toggle.svelte");

let mounted: ReturnType<typeof mount> | undefined;
let index: SettingsIndex;
let props = $state<{ late: boolean; tip: string | null }>({ late: false, tip: null });

function show(start: { late?: boolean; tip?: string | null } = {}) {
  props.late = start.late ?? false;
  props.tip = start.tip ?? null;
  const fixture = mount(Fixture, { target: document.body, props });
  mounted = fixture;
  index = fixture.index;
  flushSync();
}
const labels = () => index.rows.map((row) => row.label);

afterEach(() => {
  if (mounted) void unmount(mounted);
  mounted = undefined;
  document.body.innerHTML = "";
});

describe("the settings index", () => {
  it("lists every mounted row with its group and category, hidden categories included", () => {
    show();
    expect(index.rows.map(({ label, group, category }) => ({ label, group, category }))).toEqual([
      { label: "Display name", group: "People", category: "account" },
      { label: "Private session", group: "People", category: "account" },
      { label: "Theme", group: "Looks", category: "appearance" },
    ]);
    expect(document.querySelectorAll("section[hidden]")).toHaveLength(1);
  });

  it("keeps rows in page order when one appears later, and drops it when it goes", () => {
    show();
    props.late = true;
    flushSync();
    expect(labels()).toEqual(["Display name", "Radio region", "Private session", "Theme"]);
    props.late = false;
    flushSync();
    expect(labels()).toEqual(["Display name", "Private session", "Theme"]);
  });

  it("is searchable by label, keywords and the category's name", () => {
    show({ late: true });
    const find = (query: string) => matchSettings(index.rows, query).map((row) => row.label);
    expect(find("radio")).toEqual(["Radio region"]);
    expect(find("greeting")).toEqual(["Display name"]);
    expect(find("appearance")).toEqual(["Theme"]);
    expect(find("account")).toEqual(["Display name", "Radio region", "Private session"]);
  });

  it("points each entry at its row", () => {
    show();
    const theme = index.rows.find((row) => row.label === "Theme");
    expect(theme?.el.querySelector("button")?.textContent).toBe("Pick");
  });

  it("empties when the page goes away", () => {
    show();
    void unmount(mounted!);
    mounted = undefined;
    flushSync();
    expect(index.rows).toEqual([]);
  });
});

describe("a row", () => {
  it("carries its description as the tooltip, and lets go of it when the description goes", () => {
    show({ tip: "Seven built in." });
    const row = index.rows.find((entry) => entry.label === "Theme")!.el;
    expect(row.getAttribute("title")).toBe("Seven built in.");
    // What Tooltip does on first hover: the title moves to data-tip.
    row.removeAttribute("title");
    props.tip = null;
    flushSync();
    expect(row.hasAttribute("title")).toBe(false);
    expect(row.hasAttribute("data-tip")).toBe(false);
  });

  it("works outside Settings, where there is nothing to list itself in", () => {
    mounted = mount(Toggle, { target: document.body, props: { checked: true, label: "Public", description: "Shows on your profile.", onchange: () => {} } });
    flushSync();
    const toggle = document.querySelector<HTMLElement>("label.toggle")!;
    expect(toggle.textContent).toContain("Public");
    expect(toggle.textContent).not.toContain("Shows on your profile.");
    expect(toggle.title).toBe("Shows on your profile.");
    expect(toggle.querySelector<HTMLInputElement>("input[role=switch]")?.checked).toBe(true);
  });
});
