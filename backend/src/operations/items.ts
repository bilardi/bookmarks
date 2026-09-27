import { randomUUID } from "node:crypto";

import { between, canRead, filterByTags, nextPosition, tooClose } from "@bookmarks/core";
import type { CreateItemBody, Item, ItemView, MoveBody, PatchItemBody, TagView } from "@bookmarks/core";

import {
  getItem,
  itemsByIds,
  lastPositionIn,
  listFolderItems,
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

export async function createItem(caller: Caller, body: CreateItemBody): Promise<Result<ItemView>> {
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
    shared: body.shared,
    createdAt: now,
    updatedAt: now,
  };
  await saveItemChange(undefined, item);
  return ok(toItemView(item, EMPTY_VIEW));
}

// Writes address the caller's own items only: the item of somebody else is simply
// not there, which also says nothing about whether it exists.
export async function updateItem(caller: Caller, id: string, body: PatchItemBody): Promise<Result<ItemView>> {
  const before = await getItem(caller.userId, id);
  if (!before) return fail("not-found");
  const link = body.link === undefined ? before.link : (body.link ?? undefined);
  if (link && before.file) return fail("link-and-file");
  const path = body.path ?? before.path;
  const after: Item = {
    ...before,
    title: body.title ?? before.title,
    text: body.text === undefined ? before.text : body.text || undefined,
    link,
    path,
    position: path === before.path ? before.position : nextPosition(await lastPositionIn(caller.userId, path)),
    tags: body.tags ?? before.tags,
    shared: body.shared ?? before.shared,
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
// the fewest reads for an intersection.
export async function filterItems(caller: Caller, owner: string, tags: string[]): Promise<Result<ItemView[]>> {
  const counts = new Map((await listTagRecords(owner)).map((tag) => [tag.name, tag.itemCount]));
  if (tags.some((tag) => !counts.get(tag))) return ok([]);
  const smallest = [...tags].sort((a, b) => (counts.get(a) as number) - (counts.get(b) as number))[0];
  const items = (await itemsByIds(owner, await tagMembers(owner, smallest))).filter((item) =>
    canRead(item, caller.userId),
  );
  const matching = filterByTags(items, tags).items.sort((a, b) =>
    a.path === b.path ? a.position - b.position : a.path < b.path ? -1 : 1,
  );
  return ok(await withViews(caller, matching));
}

// Others see a tag only while something shared carries it, and its count is what
// they can see.
export async function listTags(caller: Caller, owner: string): Promise<Result<TagView[]>> {
  const own = owner === caller.userId;
  const tags = (await listTagRecords(owner))
    .filter((tag) => (own ? tag.itemCount > 0 : tag.sharedCount > 0))
    .map((tag) => (own ? tag : { ...tag, itemCount: tag.sharedCount }));
  return ok(tags);
}
