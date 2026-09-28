import type { PublicItemView } from "@bookmarks/core";

import { listPublished } from "../repository/items";

// Only what a visitor needs, in the order of the folders of the curator: the text
// of an item stays with its owner and the invited.
export async function listPublic(): Promise<PublicItemView[]> {
  const items = (await listPublished()).filter((item) => item.link !== undefined);
  items.sort((a, b) => (a.path === b.path ? a.position - b.position : a.path < b.path ? -1 : 1));
  return items.map((item) => ({ id: item.id, title: item.title, link: item.link as string, tags: item.tags }));
}
