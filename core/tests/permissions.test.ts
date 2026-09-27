import { describe, expect, it } from "vitest";

import { canRead, canWrite } from "../src/permissions";
import { kindOf } from "../src/types";

describe("canRead", () => {
  it("lets the owner read, and the others only what is shared", () => {
    expect(canRead({ owner: "a", shared: false }, "a")).toBe(true);
    expect(canRead({ owner: "a", shared: false }, "b")).toBe(false);
    expect(canRead({ owner: "a", shared: true }, "b")).toBe(true);
  });
});

describe("canWrite", () => {
  it("lets only the owner write, shared or not", () => {
    expect(canWrite({ owner: "a" }, "a")).toBe(true);
    expect(canWrite({ owner: "a" }, "b")).toBe(false);
  });
});

describe("kindOf", () => {
  it("derives the kind from what the item carries", () => {
    expect(kindOf({ link: "https://example.com" })).toBe("link");
    expect(kindOf({ file: { key: "k", name: "n", size: 0, contentType: "audio/mpeg", status: "pending" } })).toBe("file");
    expect(kindOf({})).toBe("note");
  });
});
