import { canRead } from "@bookmarks/core";
import type { Item, ItemView, ViewBody, ViewState } from "@bookmarks/core";

import { getItem } from "../repository/items";
import { getViews, putView } from "../repository/views";
import { fail, ok, type Result } from "../result";
import type { Caller } from "../http";

export const EMPTY_VIEW: ViewState = { seen: false, flag: false, note: "" };

// The key of the object stays inside: the pages ask for a signed URL by item.
export function toItemView(item: Item, view: ViewState): ItemView {
  return {
    id: item.id,
    owner: item.owner,
    title: item.title,
    text: item.text,
    link: item.link,
    file: item.file && {
      name: item.file.name,
      size: item.file.size,
      contentType: item.file.contentType,
      status: item.file.status,
    },
    path: item.path,
    position: item.position,
    tags: item.tags,
    shared: item.shared,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    view,
  };
}

export async function withViews(caller: Caller, items: Item[]): Promise<ItemView[]> {
  const views = await getViews(caller.userId, items.map((item) => item.id));
  return items.map((item) => toItemView(item, views.get(item.id) ?? EMPTY_VIEW));
}

// The personal view is the one thing a person writes on the items of others.
export async function setView(caller: Caller, owner: string, id: string, body: ViewBody): Promise<Result<ViewState>> {
  const item = await getItem(owner, id);
  if (!item) return fail("not-found");
  if (!canRead(item, caller.userId)) return fail("forbidden");
  await putView(caller.userId, id, body);
  return ok(body);
}
