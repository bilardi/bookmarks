import { beforeEach, describe, expect, it } from "vitest";

import { createItemBodySchema } from "@bookmarks/core";

import { handleOf, previewShared, purgePerson, type PurgeStore } from "../src/purging";
import { createItem, listFolder } from "../src/operations/items";
import { setView } from "../src/operations/views";
import { getProfileRecord, registerProfile } from "../src/repository/profiles";
import { getItem, listOwnerItems, markFileReady } from "../src/repository/items";
import { getViews } from "../src/repository/views";
import { caller, wipeUsers } from "./helpers";

const GONE = caller("purging-gone", "Gone");
const CURATOR = caller("purging-curator", "Curator");
const OTHER = caller("purging-other", "Other");

function fakeStore(): PurgeStore & { moves: [string, string][]; removed: string[] } {
  const moves: [string, string][] = [];
  const removed: string[] = [];
  return {
    moves,
    removed,
    move: async (from, to) => {
      moves.push([from, to]);
    },
    removePrefix: async (prefix) => {
      removed.push(prefix);
      return 2;
    },
  };
}

async function add(extra: Record<string, unknown> = {}) {
  const res = await createItem(GONE, createItemBodySchema.parse({ title: "t", ...extra }), false);
  if (!res.ok) throw new Error(res.error);
  return res.view;
}

beforeEach(async () => {
  await wipeUsers([GONE.userId, CURATOR.userId, OTHER.userId]);
  await registerProfile(GONE);
});

describe("handleOf", () => {
  it("takes the part before @ in the rule of names", () => {
    expect(handleOf("Mario.Rossi+x@test")).toBe("mario-rossi-x");
    expect(handleOf("@test")).toBe("person");
  });
});

describe("previewShared", () => {
  it("counts the shared items and lists them as CSV, writing nothing", async () => {
    await add({ title: "Shared, a link", link: "https://x.test/", path: "lessons", tags: ["a", "b"], shared: true });
    await add({ title: "Shared file", file: { name: "a.mp3", contentType: "audio/mpeg" }, shared: true });
    await add({ title: "Private" });

    const preview = await previewShared(GONE.userId);
    expect(preview.count).toBe(2);
    expect(preview.csv.trim().split("\n")).toEqual([
      "title,path,link,file,tags",
      "Shared file,,,a.mp3,",
      '"Shared, a link",lessons,https://x.test/,,a b',
    ]);
    expect((await listOwnerItems(GONE.userId)).length).toBe(3);
  });
});

describe("purgePerson", () => {
  it("deletes everything of the person, their files included", async () => {
    await add({ title: "Mine", tags: ["a"] });
    const store = fakeStore();

    expect(await purgePerson(await getProfileRecord(GONE.userId), store)).toEqual({ kept: 0, deleted: 1, files: 2 });
    expect(await listOwnerItems(GONE.userId)).toEqual([]);
    expect((await getProfileRecord(GONE.userId)).email).toBe("");
    expect(store.removed).toEqual([`files/${GONE.userId}/`]);
  });

  it("passes what was shared to the curator, under from/<handle>, and deletes the rest", async () => {
    const shared = await add({ title: "Shared", path: "lessons", tags: ["x"], shared: true, file: { name: "a.mp3", contentType: "audio/mpeg" } });
    await markFileReady((await getItem(GONE.userId, shared.id))!, 10);
    await add({ title: "Private" });
    const store = fakeStore();

    expect(await purgePerson(await getProfileRecord(GONE.userId), store, CURATOR)).toEqual({ kept: 1, deleted: 2, files: 2 });
    const moved = await getItem(CURATOR.userId, shared.id);
    expect(moved && [moved.title, moved.path, moved.shared, moved.file?.status]).toEqual(["Shared", "from/purging-gone/lessons", true, "pending"]);
    expect(store.moves).toEqual([[`files/${GONE.userId}/${shared.id}`, `files/${CURATOR.userId}/${shared.id}`]]);
    const folder = await listFolder(CURATOR, CURATOR.userId, "from/purging-gone/lessons");
    expect(folder.ok && folder.view.map((i) => i.title)).toEqual(["Shared"]);
  });

  it("keeps the id, so the notes of the others stay", async () => {
    const shared = await add({ title: "Shared", link: "https://x.test/", shared: true });
    await setView(OTHER, GONE.userId, shared.id, { seen: true, flag: false, note: "kept" });

    await purgePerson(await getProfileRecord(GONE.userId), fakeStore(), CURATOR);
    expect((await getViews(OTHER.userId, [shared.id])).get(shared.id)?.note).toBe("kept");
  });

  it("puts too deep a path at the top of its folder", async () => {
    const deep = "a/b/c/d/e/f/g/h/i/j";
    const shared = await add({ title: "Deep", path: deep, link: "https://x.test/", shared: true });

    await purgePerson(await getProfileRecord(GONE.userId), fakeStore(), CURATOR);
    expect((await getItem(CURATOR.userId, shared.id))?.path).toBe("from/purging-gone");
  });
});
