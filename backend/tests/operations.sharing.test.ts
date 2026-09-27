import { beforeEach, describe, expect, it } from "vitest";

import { createItemBodySchema } from "@bookmarks/core";

import { createItem, filterItems, listFolder, listTags } from "../src/operations/items";
import { listFoldersOf } from "../src/operations/folders";
import { getMe, listOwnersFor } from "../src/operations/me";
import { setView } from "../src/operations/views";
import { caller, wipeUsers } from "./helpers";

const OWNER = caller("ops-share-owner", "Ada");
const VIEWER = caller("ops-share-viewer", "Bob");

async function add(title: string, extra: Record<string, unknown>) {
  const res = await createItem(OWNER, createItemBodySchema.parse({ title, ...extra }));
  if (!res.ok) throw new Error(res.error);
  return res.view;
}

beforeEach(async () => {
  await wipeUsers([OWNER.userId, VIEWER.userId]);
  await getMe(OWNER, "");
  await getMe(VIEWER, "");
});

describe("what a viewer sees", () => {
  it("finds the owner, the shared folders, the shared items and their tags only", async () => {
    const shared = await add("l1", { path: "lessons/english", tags: ["lessons", "english"], shared: true });
    await add("draft", { path: "lessons/english", tags: ["lessons", "draft"] });
    await add("private", { path: "private", tags: ["mine"] });

    expect(await listOwnersFor(VIEWER)).toContainEqual({ userId: OWNER.userId, name: "Ada" });
    expect((await listOwnersFor(OWNER)).some((o) => o.userId === OWNER.userId)).toBe(false);

    const top = await listFoldersOf(VIEWER, OWNER.userId, "");
    expect(top.ok && top.view).toEqual([{ path: "lessons", itemCount: 1, sharedCount: 1 }]);

    const items = await listFolder(VIEWER, OWNER.userId, "lessons/english");
    expect(items.ok && items.view.map((i) => i.id)).toEqual([shared.id]);

    const filtered = await filterItems(VIEWER, OWNER.userId, ["lessons"]);
    expect(filtered.ok && filtered.view.map((i) => i.id)).toEqual([shared.id]);

    const tags = await listTags(VIEWER, OWNER.userId);
    expect(tags.ok && tags.view.map((t) => t.name)).toEqual(["english", "lessons"]);
  });

  it("writes a personal view on a shared item and refuses an unshared item", async () => {
    const shared = await add("l1", { shared: true });
    const draft = await add("draft", {});

    const view = { seen: true, flag: true, note: "ask about this" };
    expect(await setView(VIEWER, OWNER.userId, shared.id, view)).toEqual({ ok: true, view });
    expect(await setView(VIEWER, OWNER.userId, draft.id, view)).toEqual({ ok: false, error: "forbidden" });

    const mine = await listFolder(VIEWER, OWNER.userId, "");
    expect(mine.ok && mine.view[0].view).toEqual(view);
    const owners = await listFolder(OWNER, OWNER.userId, "");
    expect(owners.ok && owners.view.map((i) => i.view)).toEqual([
      { seen: false, flag: false, note: "" },
      { seen: false, flag: false, note: "" },
    ]);
  });
});
