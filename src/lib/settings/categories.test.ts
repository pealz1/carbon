import { describe, expect, it } from "vitest";
import { CATEGORIES, categoryHref, categoryOf } from "./categories";

const at = (path: string) => categoryOf(new URL(path, "http://carbon.test"));

describe("categoryOf", () => {
  it("opens Account by default", () => {
    expect(at("/settings")).toBe("account");
  });

  it("opens the category in ?section=", () => {
    for (const { id } of CATEGORIES) expect(at(categoryHref(id))).toBe(id);
  });

  it("falls back to Account for a category that doesn't exist", () => {
    expect(at("/settings?section=nope")).toBe("account");
    expect(at("/settings?section=")).toBe("account");
  });

  it("lands links from elsewhere in the category that holds their anchor", () => {
    expect(at("/settings#servers")).toBe("services");
    expect(at("/settings#backup")).toBe("data");
  });

  it("ignores anchors it doesn't know, object keys included", () => {
    expect(at("/settings#constructor")).toBe("account");
    expect(at("/settings#lyrics")).toBe("account");
  });

  it("lets ?section= win over an anchor", () => {
    expect(at("/settings?section=lyrics#servers")).toBe("lyrics");
  });
});

describe("CATEGORIES", () => {
  it("has no duplicate ids", () => {
    expect(new Set(CATEGORIES.map((c) => c.id)).size).toBe(CATEGORIES.length);
  });
});
