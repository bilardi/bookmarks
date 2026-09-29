import { beforeEach, describe, expect, it } from "vitest";

import { createItemBodySchema } from "@bookmarks/core";

import {
  createItem,
  deleteItem,
  filterItems,
  listFolder,
  listTags,
  moveItem,
  updateItem,
} from "../src/operations/items";
import { getMe, getUsage } from "../src/operations/me";
import { setPosition, getItem } from "../src/repository/items";
import { addUsage } from "../src/repository/usage";
import { caller, wipeUsers } from "./helpers";
import { fakeStorage } from "./fakeStorage";

const A = caller("ops-items-a", "Ada");

async function add(title: string, extra: Record<string, unknown> = {}) {
  const res = await createItem(A, createItemBodySchema.parse({ title, ...extra }));
  if (!res.ok) throw new Error(res.error);
  return res.view;
}

async function order(path = ""): Promise<string[]> {
  const res = await listFolder(A, A.userId, path);
  return res.ok ? res.view.map((i) => i.title) : [];
}

beforeEach(async () => {
  await wipeUsers([A.userId]);
});

describe("createItem", () => {
  it("appends to the end of its folder with an empty view", async () => {
    await add("a");
    const b = await add("b", { text: "note of b" });
    expect(b.position).toBe(2);
    expect(b.view).toEqual({ seen: false, flag: false, note: "" });
    expect(await order()).toEqual(["a", "b"]);
  });

  it("creates a file item as pending, with a key that carries no folder", async () => {
    const f = await add("lesson", { path: "lessons", file: { name: "l1.mp3", contentType: "audio/mpeg" } });
    expect(f.file).toEqual({ name: "l1.mp3", size: 0, contentType: "audio/mpeg", status: "pending" });
    expect((await getItem(A.userId, f.id))?.file?.key).toBe(`files/${A.userId}/${f.id}`);
  });
});

describe("updateItem", () => {
  it("moves an item to the end of another folder", async () => {
    await add("x", { path: "b" });
    const a = await add("a", { path: "a" });
    const res = await updateItem(A, a.id, { path: "b" });
    expect(res.ok && res.view.position).toBe(2);
    expect(await order("b")).toEqual(["x", "a"]);
  });

  it("removes the text with null", async () => {
    const a = await add("a", { text: "t" });
    const res = await updateItem(A, a.id, { text: null });
    expect(res.ok && res.view.text).toBeUndefined();
  });

  it("refuses a link on a file item", async () => {
    const f = await add("f", { file: { name: "a.pdf", contentType: "application/pdf" } });
    expect(await updateItem(A, f.id, { link: "https://example.com" })).toEqual({ ok: false, error: "link-and-file" });
  });

  it("does not find the item of somebody else", async () => {
    const a = await add("a");
    expect(await updateItem(caller("ops-items-other"), a.id, { title: "b" })).toEqual({ ok: false, error: "not-found" });
  });
});

describe("deleteItem", () => {
  it("deletes the object of a file item", async () => {
    const storage = fakeStorage();
    const f = await add("f", { file: { name: "a.pdf", contentType: "application/pdf" } });
    expect(await deleteItem(A, f.id, storage)).toEqual({ ok: true, view: { id: f.id } });
    expect(storage.deleted).toEqual([`files/${A.userId}/${f.id}`]);
    expect(await getItem(A.userId, f.id)).toBeNull();
  });
});

describe("moveItem", () => {
  it("moves above the visible item across hidden ones", async () => {
    const a = await add("a", { tags: ["x"] });
    await add("b");
    const c = await add("c", { tags: ["x"] });
    await add("d");
    const e = await add("e", { tags: ["x"] });
    // The filter on x shows a, c, e: moving e up jumps over the hidden d and lands
    // right above c, so b stays where it is.
    const res = await moveItem(A, e.id, { direction: "up", adjacentId: c.id });
    expect(res.ok).toBe(true);
    expect(await order()).toEqual(["a", "b", "e", "c", "d"]);
    expect(a.position).toBe(1);
  });

  it("moves below the visible item", async () => {
    const a = await add("a");
    const b = await add("b");
    await add("c");
    await moveItem(A, a.id, { direction: "down", adjacentId: b.id });
    expect(await order()).toEqual(["b", "a", "c"]);
  });

  it("renumbers the folder when positions run out of room", async () => {
    await add("a");
    const b = await add("b");
    const c = await add("c");
    await setPosition((await getItem(A.userId, b.id))!, 1 + 5e-7);
    const res = await moveItem(A, c.id, { direction: "up", adjacentId: b.id });
    expect(res.ok).toBe(true);
    expect(await order()).toEqual(["a", "c", "b"]);
  });

  it("refuses an adjacent item of another folder or on the wrong side", async () => {
    const a = await add("a");
    const b = await add("b");
    const other = await add("o", { path: "elsewhere" });
    expect(await moveItem(A, b.id, { direction: "up", adjacentId: other.id })).toEqual({ ok: false, error: "not-adjacent" });
    expect(await moveItem(A, a.id, { direction: "up", adjacentId: b.id })).toEqual({ ok: false, error: "not-adjacent" });
  });
});

describe("filterItems and listTags", () => {
  it("keeps the items with every tag, sorted by folder and position", async () => {
    await add("l2", { path: "lessons/english", tags: ["lessons", "english"] });
    await add("l1", { path: "lessons/english", tags: ["lessons", "english"] });
    await add("s1", { path: "lessons/spanish", tags: ["lessons", "spanish"] });
    const res = await filterItems(A, A.userId, ["lessons", "english"]);
    expect(res.ok && res.view.map((i) => i.title)).toEqual(["l2", "l1"]);
    const all = await filterItems(A, A.userId, ["lessons"]);
    expect(all.ok && all.view.map((i) => i.title)).toEqual(["l2", "l1", "s1"]);
  });

  it("finds nothing for a tag that does not exist", async () => {
    await add("a", { tags: ["x"] });
    expect(await filterItems(A, A.userId, ["x", "missing"])).toEqual({ ok: true, view: [] });
  });

  it("lists only the tags still in use", async () => {
    const a = await add("a", { tags: ["x", "y"] });
    await updateItem(A, a.id, { tags: ["x"] });
    const res = await listTags(A, A.userId);
    expect(res.ok && res.view).toEqual([{ name: "x", itemCount: 1, sharedCount: 0, connections: 1 }]);
  });

  it("lists the tags of what is under a folder, subfolders included, with the tone of the whole", async () => {
    await add("e1", { path: "lessons/english", tags: ["lessons", "english"] });
    await add("s1", { path: "lessons/spanish", tags: ["lessons", "spanish"], shared: true });
    await add("r1", { path: "recipes", tags: ["pasta"] });

    const lessons = await listTags(A, A.userId, "lessons");
    expect(lessons.ok && lessons.view).toEqual([
      { name: "english", itemCount: 1, sharedCount: 0, connections: 2 },
      { name: "lessons", itemCount: 2, sharedCount: 1, connections: 3 },
      { name: "spanish", itemCount: 1, sharedCount: 1, connections: 2 },
    ]);
    const english = await listTags(A, A.userId, "lessons/english");
    expect(english.ok && english.view.map((t) => [t.name, t.itemCount, t.connections])).toEqual([
      ["english", 1, 2],
      ["lessons", 1, 3],
    ]);
    const root = await listTags(A, A.userId, "");
    expect(root.ok && root.view.map((t) => t.name)).toEqual(["english", "lessons", "pasta", "spanish"]);
  });

  it("filters only what is under a folder", async () => {
    await add("e1", { path: "lessons/english", tags: ["lessons"] });
    await add("s1", { path: "lessons/spanish", tags: ["lessons"] });
    await add("n1", { path: "notes", tags: ["lessons"] });
    const res = await filterItems(A, A.userId, ["lessons"], "lessons");
    expect(res.ok && res.view.map((i) => i.title)).toEqual(["e1", "s1"]);
  });
});

describe("me and usage", () => {
  it("recognizes the curator by email, whatever its case", async () => {
    expect((await getMe(A, A.email.toUpperCase())).curator).toBe(true);
    expect((await getMe(A, "someone@else")).curator).toBe(false);
    expect((await getMe(A, "")).curator).toBe(false);
  });

  it("returns the months with their cost and the stored bytes", async () => {
    await getMe(A, "");
    await addUsage(A.userId, "2026-09", { getCount: 1000 });
    const prices = { referenceDate: "2026-09-27", getPer1000: 0.001, putPer1000: 0.01, transferOutPerGb: 0.1, storagePerGbMonth: 0.02 };
    const usage = await getUsage(A, prices);
    expect(usage.months).toEqual([
      { month: "2026-09", getCount: 1000, getBytes: 0, putCount: 0, putBytes: 0, cost: expect.closeTo(0.001, 6) },
    ]);
    expect(usage.storedBytes).toBe(0);
    expect(usage.pricesDate).toBe("2026-09-27");
  });

  it("leaves the costs empty, not zero, without prices", async () => {
    await getMe(A, "");
    await addUsage(A.userId, "2026-09", { getCount: 1000 });
    expect(await getUsage(A, null)).toEqual({
      months: [{ month: "2026-09", getCount: 1000, getBytes: 0, putCount: 0, putBytes: 0 }],
      storedBytes: 0,
    });
  });
});
