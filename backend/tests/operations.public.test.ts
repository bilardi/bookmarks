import { beforeEach, describe, expect, it } from "vitest";

import { createItemBodySchema } from "@bookmarks/core";

import { createItem, listTags, updateItem } from "../src/operations/items";
import { shareFolder } from "../src/operations/folders";
import { listPublic } from "../src/operations/public";
import { caller, wipeUsers } from "./helpers";

const CURATOR = caller("ops-public-curator");
const OTHER = caller("ops-public-other");

async function add(who = CURATOR, extra: Record<string, unknown> = {}, curator = true) {
  const res = await createItem(who, createItemBodySchema.parse({ title: "Docs", link: "https://example.com/", ...extra }), curator);
  if (!res.ok) throw new Error(res.error);
  return res.view;
}

async function publicIds(): Promise<string[]> {
  return (await listPublic()).map((i) => i.id);
}

beforeEach(async () => {
  await wipeUsers([CURATOR.userId, OTHER.userId]);
});

describe("publication", () => {
  it("publishes a link of the curator, and shares it too", async () => {
    const item = await add(CURATOR, { published: true });
    expect(item.published).toBe(true);
    expect(item.shared).toBe(true);
    expect(await publicIds()).toContain(item.id);
  });

  it("refuses a publication from anybody but the curator", async () => {
    const res = await createItem(OTHER, createItemBodySchema.parse({ title: "x", link: "https://example.com/", published: true }), false);
    expect(res).toEqual({ ok: false, error: "forbidden" });
    const own = await add(OTHER, {}, false);
    expect(await updateItem(OTHER, own.id, { published: true }, false)).toEqual({ ok: false, error: "forbidden" });
  });

  it("refuses to publish what has no link", async () => {
    const note = await createItem(CURATOR, createItemBodySchema.parse({ title: "A note" }), true);
    if (!note.ok) throw new Error(note.error);
    expect(await updateItem(CURATOR, note.view.id, { published: true }, true)).toEqual({ ok: false, error: "public-needs-link" });
    const link = await add(CURATOR, { published: true });
    expect(await updateItem(CURATOR, link.id, { link: null }, true)).toEqual({ ok: false, error: "public-needs-link" });
  });

  it("takes an item off the public page when it is unshared", async () => {
    const item = await add(CURATOR, { published: true });
    const res = await updateItem(CURATOR, item.id, { shared: false }, true);
    expect(res.ok && [res.view.shared, res.view.published]).toEqual([false, false]);
    expect(await publicIds()).not.toContain(item.id);
  });

  it("takes the folder off the public page when it is unshared", async () => {
    const item = await add(CURATOR, { published: true, path: "links" });
    await shareFolder(CURATOR, "links", false);
    expect(await publicIds()).not.toContain(item.id);
  });
});

describe("listPublic", () => {
  it("gives a visitor the title, the link and the tags only, in the order of the folders", async () => {
    const second = await add(CURATOR, { title: "Second", published: true, path: "b", text: "private words" });
    const first = await add(CURATOR, { title: "First", published: true, path: "a", tags: ["x"] });
    await add(CURATOR, { title: "Not published" });

    const mine = (await listPublic()).filter((i) => [first.id, second.id].includes(i.id));
    expect(mine).toEqual([
      { id: first.id, title: "First", link: "https://example.com/", tags: ["x"] },
      { id: second.id, title: "Second", link: "https://example.com/", tags: [] },
    ]);
  });
});

describe("listTags", () => {
  it("counts the tags each tag appears with, over what the caller can read", async () => {
    await add(CURATOR, { tags: ["lessons", "english"], shared: true });
    await add(CURATOR, { tags: ["lessons", "private"] });

    const own = await listTags(CURATOR, CURATOR.userId);
    expect(own.ok && Object.fromEntries(own.view.map((t) => [t.name, t.connections]))).toEqual({
      english: 1,
      lessons: 2,
      private: 1,
    });
    const seen = await listTags(OTHER, CURATOR.userId);
    expect(seen.ok && Object.fromEntries(seen.view.map((t) => [t.name, t.connections]))).toEqual({ english: 1, lessons: 1 });
  });
});
