import { describe, expect, it } from "vitest";

import {
  createItemBodySchema,
  moveBodySchema,
  patchItemBodySchema,
  viewBodySchema,
} from "../src/contracts";

describe("createItemBodySchema", () => {
  it("fills the defaults and normalizes path and tags", () => {
    const parsed = createItemBodySchema.parse({
      title: " Lesson 1 ",
      path: "/Lessons/English/",
      tags: ["Lessons", "lessons", "English"],
    });
    expect(parsed).toEqual({
      title: "Lesson 1",
      path: "lessons/english",
      tags: ["lessons", "english"],
      shared: false,
      published: false,
    });
  });

  it("publishes only a link", () => {
    expect(createItemBodySchema.safeParse({ title: "t", published: true }).success).toBe(false);
    expect(createItemBodySchema.safeParse({ title: "t", published: true, link: "https://example.com/" }).success).toBe(true);
  });

  it("puts an item without a path in the root", () => {
    expect(createItemBodySchema.parse({ title: "a note" }).path).toBe("");
  });

  it("refuses a text over 250 characters", () => {
    expect(createItemBodySchema.safeParse({ title: "t", text: "x".repeat(251) }).success).toBe(false);
    expect(createItemBodySchema.safeParse({ title: "t", text: "x".repeat(250) }).success).toBe(true);
  });

  it("refuses a link and a file together", () => {
    const body = {
      title: "t",
      link: "https://example.com",
      file: { name: "a.mp3", contentType: "audio/mpeg" },
    };
    expect(createItemBodySchema.safeParse(body).success).toBe(false);
  });

  it("refuses a link that is not http or https", () => {
    expect(createItemBodySchema.safeParse({ title: "t", link: "ftp://example.com" }).success).toBe(false);
    expect(createItemBodySchema.safeParse({ title: "t", link: "javascript:alert(1)" }).success).toBe(false);
  });

  it("refuses invalid tags, too many tags and an invalid path", () => {
    expect(createItemBodySchema.safeParse({ title: "t", tags: ["two words"] }).success).toBe(false);
    const eleven = Array.from({ length: 11 }, (_, i) => `t${i}`);
    expect(createItemBodySchema.safeParse({ title: "t", tags: eleven }).success).toBe(false);
    expect(createItemBodySchema.safeParse({ title: "t", path: "a b" }).success).toBe(false);
  });
});

describe("patchItemBodySchema", () => {
  it("accepts null to remove the text or the link", () => {
    expect(patchItemBodySchema.parse({ text: null })).toEqual({ text: null });
  });

  it("refuses an empty patch", () => {
    expect(patchItemBodySchema.safeParse({}).success).toBe(false);
  });
});

describe("moveBodySchema", () => {
  it("needs a direction and the adjacent item", () => {
    expect(moveBodySchema.safeParse({ direction: "up", adjacentId: "x" }).success).toBe(true);
    expect(moveBodySchema.safeParse({ direction: "left", adjacentId: "x" }).success).toBe(false);
  });
});

describe("viewBodySchema", () => {
  it("needs the three fields, with the note within 250 characters", () => {
    expect(viewBodySchema.safeParse({ seen: true, flag: false, note: "" }).success).toBe(true);
    expect(viewBodySchema.safeParse({ seen: true, flag: false, note: "x".repeat(251) }).success).toBe(false);
  });
});
