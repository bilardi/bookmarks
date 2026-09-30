import { randomUUID } from "node:crypto";

import { between, canRead, filterByTags, isInside, nextPosition, tagConnections, tooClose } from "@bookmarks/core";
import type { CreateItemBody, Item, ItemView, MoveBody, PatchItemBody, TagView } from "@bookmarks/core";

import {
  getItem,
  itemsByIds,
  lastPositionIn,
  listFolderItems,
  listOwnerItems,
  neighbor,
  renumberFolder,
  saveItemChange,
  setPosition,
} from "../repository/items";
import { addStoredBytes } from "../repository/profiles";
import { listTagRecords, tagMembers } from "../repository/tags";
import { fileKey } from "../keys";
import { fail, ok, type Result } from "../result";
import { EMPTY_VIEW, toItemView, withViews } from "./views";
import type { Caller } from "../http";
import type { Storage } from "../storage";

export async function createItem(caller: Caller, body: CreateItemBody, curator = false): Promise<Result<ItemView>> {
  if (body.published && !curator) return fail("forbidden");
  const id = randomUUID();
  const now = new Date().toISOString();
  const item: Item = {
    id,
    owner: caller.userId,
    title: body.title,
    text: body.text || undefined,
    link: body.link,
    file: body.file && {
      key: fileKey(caller.userId, id),
      name: body.file.name,
      size: 0,
      contentType: body.file.contentType,
      status: "pending",
    },
    path: body.path,
    position: nextPosition(await lastPositionIn(caller.userId, body.path)),
    tags: body.tags,
    shared: body.shared || body.published,
    published: body.published,
    createdAt: now,
    updatedAt: now,
  };
  await saveItemChange(undefined, item);
  return ok(toItemView(item, EMPTY_VIEW));
}

// Writes address the caller's own items only: the item of somebody else is simply
// not there, which also says nothing about whether it exists.
export async function updateItem(
  caller: Caller,
  id: string,
  body: PatchItemBody,
  curator = false,
): Promise<Result<ItemView>> {
  const before = await getItem(caller.userId, id);
  if (!before) return fail("not-found");
  const link = body.link === undefined ? before.link : (body.link ?? undefined);
  if (link && before.file) return fail("link-and-file");
  if (body.published === true && !curator) return fail("forbidden");
  // Public means shared: publishing shares, and unsharing takes it off the public page.
  let published = body.published ?? before.published === true;
  if (body.shared === false) published = false;
  if (published && !link) return fail("public-needs-link");
  const shared = published || (body.shared ?? before.shared);
  const path = body.path ?? before.path;
  const after: Item = {
    ...before,
    title: body.title ?? before.title,
    text: body.text === undefined ? before.text : body.text || undefined,
    link,
    path,
    position: path === before.path ? before.position : nextPosition(await lastPositionIn(caller.userId, path)),
    tags: body.tags ?? before.tags,
    shared,
    published,
    updatedAt: new Date().toISOString(),
  };
  await saveItemChange(before, after);
  const [view] = await withViews(caller, [after]);
  return ok(view);
}

export async function deleteItem(caller: Caller, id: string, storage: Storage): Promise<Result<{ id: string }>> {
  const item = await getItem(caller.userId, id);
  if (!item) return fail("not-found");
  if (item.file) {
    await storage.deleteObject(item.file.key);
    if (item.file.status === "ready") await addStoredBytes(caller.userId, -item.file.size);
  }
  await saveItemChange(item, undefined);
  return ok({ id });
}

// The position just past the target, on the side of the move, or null when there
// is no room left between the two.
async function positionPast(item: Item, target: Item, up: boolean): Promise<number | null> {
  const beyond = await neighbor(item.owner, item.path, target.position, up ? "before" : "after");
  const position = up ? between(beyond?.position, target.position) : between(target.position, beyond?.position);
  if (tooClose(position, target.position)) return null;
  if (beyond && tooClose(position, beyond.position)) return null;
  return position;
}

export async function moveItem(caller: Caller, id: string, body: MoveBody): Promise<Result<ItemView>> {
  const item = await getItem(caller.userId, id);
  const target = await getItem(caller.userId, body.adjacentId);
  if (!item || !target) return fail("not-found");
  const up = body.direction === "up";
  const wrongSide = up ? target.position >= item.position : target.position <= item.position;
  if (target.id === item.id || target.path !== item.path || wrongSide) return fail("not-adjacent");

  let position = await positionPast(item, target, up);
  if (position === null) {
    await renumberFolder(item.owner, item.path);
    const renumbered = (await getItem(caller.userId, target.id)) as Item;
    position = (await positionPast(item, renumbered, up)) as number;
  }
  await setPosition(item, position);
  const [view] = await withViews(caller, [{ ...item, position }]);
  return ok(view);
}

export async function listFolder(caller: Caller, owner: string, path: string): Promise<Result<ItemView[]>> {
  const items = (await listFolderItems(owner, path)).filter((item) => canRead(item, caller.userId));
  return ok(await withViews(caller, items));
}

// The members of the smallest selected tag are read, then filtered on the others:
// the fewest reads for an intersection. Only what is under the path is kept, the
// root being everything.
export async function filterItems(
  caller: Caller,
  owner: string,
  tags: string[],
  path = "",
): Promise<Result<ItemView[]>> {
  const counts = new Map((await listTagRecords(owner)).map((tag) => [tag.name, tag.itemCount]));
  if (tags.some((tag) => !counts.get(tag))) return ok([]);
  const smallest = [...tags].sort((a, b) => (counts.get(a) as number) - (counts.get(b) as number))[0];
  const items = (await itemsByIds(owner, await tagMembers(owner, smallest))).filter(
    (item) => canRead(item, caller.userId) && isInside(item.path, path),
  );
  const matching = filterByTags(items, tags).items.sort((a, b) =>
    a.path === b.path ? a.position - b.position : a.path < b.path ? -1 : 1,
  );
  return ok(await withViews(caller, matching));
}

// The tags of what the caller can read under the path, subfolders included, the root
// being everything: others see only the shared items, so a tag counts only those.
export async function listTags(caller: Caller, owner: string, path = ""): Promise<Result<TagView[]>> {
  const readable = (await listOwnerItems(owner)).filter((item) => canRead(item, caller.userId));
  // The tone of a tag comes from everything the caller can read of this owner, not
  // from the folder or a filter: it stays the same wherever the bar is shown.
  const connections = tagConnections(readable);
  const counts = new Map<string, { itemCount: number; sharedCount: number }>();
  for (const item of readable) {
    if (!isInside(item.path, path)) continue;
    for (const name of item.tags) {
      const count = counts.get(name) ?? { itemCount: 0, sharedCount: 0 };
      count.itemCount += 1;
      if (item.shared) count.sharedCount += 1;
      counts.set(name, count);
    }
  }
  const tags = [...counts]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, count]) => ({ name, ...count, connections: connections.get(name) ?? 0 }));
  return ok(tags);
}
