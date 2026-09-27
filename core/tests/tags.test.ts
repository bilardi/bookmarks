import { describe, expect, it } from "vitest";

import { filterByTags, normalizeTag } from "../src/tags";

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
