import { describe, expect, it } from "vitest";

import { bookmarksPath, parseRoute, PATHS, publicPath } from "../src/router";

describe("parseRoute", () => {
  it("reads the own bookmarks, their folders and the tags of the filter", () => {
    expect(parseRoute("/")).toEqual({ name: "bookmarks", path: "", tags: [] });
    expect(parseRoute("/my/lessons/english")).toEqual({ name: "bookmarks", path: "lessons/english", tags: [] });
    expect(parseRoute("/my/lessons", "?tags=grammar,verbs")).toEqual({
      name: "bookmarks",
      path: "lessons",
      tags: ["grammar", "verbs"],
    });
  });

  it("reads the bookmarks of the others", () => {
    expect(parseRoute("/shared")).toEqual({ name: "shared" });
    expect(parseRoute("/shared/o1")).toEqual({ name: "bookmarks", owner: "o1", path: "", tags: [] });
    expect(parseRoute("/shared/o1/lessons/english")).toEqual({
      name: "bookmarks",
      owner: "o1",
      path: "lessons/english",
      tags: [],
    });
  });

  it("reads the usage, and sends anything else to the own bookmarks", () => {
    expect(parseRoute("/usage")).toEqual({ name: "usage" });
    expect(parseRoute("/nothing/here")).toEqual({ name: "bookmarks", path: "", tags: [] });
  });
});

describe("bookmarksPath", () => {
  it("writes the address parseRoute reads back", () => {
    expect(bookmarksPath(undefined, "")).toBe("/");
    expect(bookmarksPath(undefined, "lessons/english")).toBe("/my/lessons/english");
    expect(bookmarksPath("o1", "")).toBe("/shared/o1");
    expect(bookmarksPath("o1", "lessons", ["grammar", "verbs"])).toBe("/shared/o1/lessons?tags=grammar,verbs");
  });
});

describe("the public page", () => {
  it("has an address of its own, with the tags of the filter", () => {
    expect(parseRoute("/public")).toEqual({ name: "public", tags: [] });
    expect(parseRoute("/public", "?tags=aws,linux")).toEqual({ name: "public", tags: ["aws", "linux"] });
    expect(publicPath(["aws"])).toBe("/public?tags=aws");
    expect(PATHS.afterLogout).toBe("/public");
  });
});
