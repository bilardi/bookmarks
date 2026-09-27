import { describe, expect, it } from "vitest";

import { ancestors, isDirectChild, isInside, normalizePath, rebase } from "../src/paths";
import { normalizeName } from "../src/names";

describe("normalizeName", () => {
  it("lowercases and trims", () => {
    expect(normalizeName("  English ")).toBe("english");
  });

  it("refuses spaces, the key separator and names too long", () => {
    expect(normalizeName("two words")).toBeNull();
    expect(normalizeName("a#b")).toBeNull();
    expect(normalizeName("-dash")).toBeNull();
    expect(normalizeName("a".repeat(65))).toBeNull();
    expect(normalizeName("a".repeat(64))).toBe("a".repeat(64));
  });
});

describe("normalizePath", () => {
  it("drops empty segments and lowercases", () => {
    expect(normalizePath(" /Lessons//English/ ")).toBe("lessons/english");
  });

  it("maps the root to the empty path", () => {
    expect(normalizePath("")).toBe("");
    expect(normalizePath("/")).toBe("");
  });

  it("refuses invalid names and paths too deep", () => {
    expect(normalizePath("lessons/two words")).toBeNull();
    expect(normalizePath(Array(11).fill("a").join("/"))).toBeNull();
    expect(normalizePath(Array(10).fill("a").join("/"))).toBe(Array(10).fill("a").join("/"));
  });
});

describe("ancestors", () => {
  it("lists the root, every folder above and the path itself", () => {
    expect(ancestors("lessons/english/basic")).toEqual([
      "",
      "lessons",
      "lessons/english",
      "lessons/english/basic",
    ]);
  });

  it("is the root alone for the root", () => {
    expect(ancestors("")).toEqual([""]);
  });
});

describe("isInside", () => {
  it("is true for the folder itself and below it", () => {
    expect(isInside("lessons", "lessons")).toBe(true);
    expect(isInside("lessons/english", "lessons")).toBe(true);
    expect(isInside("anything", "")).toBe(true);
  });

  it("is false for a name that only starts the same", () => {
    expect(isInside("lessonsplus", "lessons")).toBe(false);
  });
});

describe("isDirectChild", () => {
  it("accepts one level below only", () => {
    expect(isDirectChild("lessons/english", "lessons")).toBe(true);
    expect(isDirectChild("lessons/english/basic", "lessons")).toBe(false);
    expect(isDirectChild("lessons", "")).toBe(true);
    expect(isDirectChild("", "")).toBe(false);
    expect(isDirectChild("lessons", "lessons")).toBe(false);
  });
});

describe("rebase", () => {
  it("moves a path under another folder", () => {
    expect(rebase("a/b/c", "a/b", "x")).toBe("x/c");
    expect(rebase("a/b", "a/b", "x")).toBe("x");
    expect(rebase("a/b/c", "a/b", "x/y")).toBe("x/y/c");
  });
});
