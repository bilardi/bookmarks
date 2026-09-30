import { describe, expect, it } from "vitest";

import { byConnections, filterByTags, normalizeTag, tagConnections, tagTone } from "../src/tags";

const L1 = { id: "l1", tags: ["lessons", "english"] };
const L2 = { id: "l2", tags: ["lessons", "spanish"] };
const B = { id: "b", tags: ["aws"] };

describe("normalizeTag", () => {
  it("follows the rule of names", () => {
    expect(normalizeTag(" Lessons ")).toBe("lessons");
    expect(normalizeTag("two words")).toBeNull();
  });
});

describe("filterByTags", () => {
  it("keeps the items with every selected tag", () => {
    expect(filterByTags([L1, L2, B], ["lessons"]).items).toEqual([L1, L2]);
    expect(filterByTags([L1, L2, B], ["lessons", "english"]).items).toEqual([L1]);
  });

  it("offers only the tags that appear together with the selection", () => {
    expect(filterByTags([L1, L2, B], ["lessons"]).available).toEqual(["english", "spanish"]);
    expect(filterByTags([L1, L2, B], ["lessons", "english"]).available).toEqual([]);
  });

  it("offers every tag when nothing is selected", () => {
    expect(filterByTags([L1, L2, B], []).available).toEqual(["aws", "english", "lessons", "spanish"]);
  });
});

describe("tagConnections", () => {
  it("counts the other tags each tag appears with", () => {
    const connections = tagConnections([
      { tags: ["lessons", "english", "grammar"] },
      { tags: ["lessons", "spanish"] },
      { tags: ["alone"] },
    ]);
    expect(Object.fromEntries(connections)).toEqual({ lessons: 3, english: 2, grammar: 2, spanish: 1, alone: 0 });
  });
});

describe("tagTone", () => {
  it("goes as in bookmarks-v3.0, from 0, a tag alone, to 5, a tag with five or more others", () => {
    expect([0, 1, 2, 3, 4, 5, 16].map(tagTone)).toEqual([0, 1, 2, 3, 4, 5, 5]);
  });
});

describe("byConnections", () => {
  it("puts the most connected first, and orders the equals by name", () => {
    const connections = new Map([["b", 3], ["a", 3], ["c", 5], ["d", 1]]);
    expect(byConnections(["d", "b", "a", "c"], connections)).toEqual(["c", "a", "b", "d"]);
  });
});
