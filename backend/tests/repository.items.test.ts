import { beforeEach, describe, expect, it } from "vitest";

import type { Item } from "@bookmarks/core";

import {
  getItem,
  lastPositionIn,
  listFolderItems,
  markFileReady,
  neighbor,
  saveItemChange,
} from "../src/repository/items";
import { getFolder } from "../src/repository/folders";
import { listTagRecords, tagMembers } from "../src/repository/tags";
import { getProfileRecord, listOwners } from "../src/repository/profiles";
import { wipeUsers } from "./helpers";

const OWNER = "repo-items-a";

function item(id: string, overrides: Partial<Item> = {}): Item {
  return {
    id,
    owner: OWNER,
    title: id,
    path: "lessons/english",
    position: 1,
    tags: ["lessons", "english"],
    shared: true,
    createdAt: "2026-09-27T00:00:00.000Z",
    updatedAt: "2026-09-27T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(async () => {
  await wipeUsers([OWNER]);
});

describe("saveItemChange", () => {
  it("writes the item, the counters, the tag members and the owner index", async () => {
    await saveItemChange(undefined, item("i1"));

    expect(await getItem(OWNER, "i1")).toEqual(item("i1"));
    expect(await getFolder(OWNER, "lessons")).toEqual({ path: "lessons", itemCount: 1, sharedCount: 1 });
    expect(await tagMembers(OWNER, "english")).toEqual(["i1"]);
    expect((await getProfileRecord(OWNER)).sharedCount).toBe(1);
    expect((await listOwners()).some((o) => o.userId === OWNER)).toBe(true);
  });

  it("moves the counters and the members when path, tags and sharing change", async () => {
    await saveItemChange(undefined, item("i1"));
    await saveItemChange(item("i1"), item("i1", { path: "lessons/spanish", tags: ["lessons", "spanish"], shared: false }));

    expect(await getFolder(OWNER, "lessons/english")).toEqual({ path: "lessons/english", itemCount: 0, sharedCount: 0 });
    expect(await getFolder(OWNER, "lessons")).toEqual({ path: "lessons", itemCount: 1, sharedCount: 0 });
    expect(await tagMembers(OWNER, "english")).toEqual([]);
    expect(await tagMembers(OWNER, "spanish")).toEqual(["i1"]);
    const tags = Object.fromEntries((await listTagRecords(OWNER)).map((t) => [t.name, t.itemCount]));
    expect(tags).toEqual({ english: 0, lessons: 1, spanish: 1 });
    expect((await listOwners()).some((o) => o.userId === OWNER)).toBe(false);
  });

  it("takes everything away when the item is deleted", async () => {
    await saveItemChange(undefined, item("i1"));
    await saveItemChange(item("i1"), undefined);

    expect(await getItem(OWNER, "i1")).toBeNull();
    expect(await getFolder(OWNER, "")).toEqual({ path: "", itemCount: 0, sharedCount: 0 });
    expect(await tagMembers(OWNER, "lessons")).toEqual([]);
  });
});

describe("folder order", () => {
  it("lists a folder by position and finds the neighbours", async () => {
    await saveItemChange(undefined, item("b", { position: 2 }));
    await saveItemChange(undefined, item("a", { position: 1 }));
    await saveItemChange(undefined, item("c", { position: 3 }));

    expect((await listFolderItems(OWNER, "lessons/english")).map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(await lastPositionIn(OWNER, "lessons/english")).toBe(3);
    expect(await lastPositionIn(OWNER, "empty")).toBeUndefined();
    expect((await neighbor(OWNER, "lessons/english", 2, "before"))?.id).toBe("a");
    expect((await neighbor(OWNER, "lessons/english", 2, "after"))?.id).toBe("c");
    expect(await neighbor(OWNER, "lessons/english", 1, "before")).toBeUndefined();
  });
});

describe("markFileReady", () => {
  it("marks a pending file once", async () => {
    const file = { key: `files/${OWNER}/f1`, name: "a.mp3", size: 0, contentType: "audio/mpeg", status: "pending" as const };
    await saveItemChange(undefined, item("f1", { file }));

    expect(await markFileReady((await getItem(OWNER, "f1"))!, 1000)).toBe(true);
    expect(await markFileReady((await getItem(OWNER, "f1"))!, 1000)).toBe(false);
    expect((await getItem(OWNER, "f1"))?.file).toEqual({ ...file, size: 1000, status: "ready" });
  });
});
