import { normalizeName, normalizePath, PATH_DEPTH_MAX, nextPosition } from "@bookmarks/core";
import type { Item } from "@bookmarks/core";

import { csvRow } from "./exporting";
import { fileKey } from "./keys";
import { lastPositionIn, listOwnerItems, saveItemChange } from "./repository/items";
import { wipePerson } from "./repository/people";
import type { ProfileRecord } from "./repository/profiles";
import type { Caller } from "./http";

// What the purge needs from S3, so that tests can stand in for it.
export interface PurgeStore {
  // Copies, checks the copy, and only then deletes the original.
  move(fromKey: string, toKey: string): Promise<void>;
  // Deletes every object under the prefix, and says how many.
  removePrefix(prefix: string): Promise<number>;
}

// The part of the address before @, in the rule of names, to name the folder of
// what a person left: from/<handle>, one folder per person under one from.
export function handleOf(email: string): string {
  const local = email.split("@")[0].toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^[-_]+/, "");
  return normalizeName(local.slice(0, 64)) ?? "person";
}

// The shared items of a person, counted and listed as CSV, for the curator to see
// before deciding whether they pass on or go with the rest. It writes nothing.
export async function previewShared(sub: string): Promise<{ count: number; csv: string }> {
  const shared = (await listOwnerItems(sub))
    .filter((item) => item.shared)
    .sort((a, b) => (a.path === b.path ? a.position - b.position : a.path < b.path ? -1 : 1));
  const rows = shared.map((item) =>
    csvRow([item.title, item.path, item.link ?? "", item.file?.name ?? "", item.tags.join(" ")]),
  );
  return { count: shared.length, csv: [csvRow(["title", "path", "link", "file", "tags"]), ...rows].join("\n") + "\n" };
}

// A shared item passes to the curator with its id, so the notes others wrote on it
// stay; its file is moved and counted again by the upload event, as an import.
async function passToCurator(item: Item, curator: Caller, root: string, store: PurgeStore): Promise<void> {
  const deeper = normalizePath(item.path === "" ? root : `${root}/${item.path}`);
  const path = deeper !== null && deeper.split("/").length <= PATH_DEPTH_MAX ? deeper : root;
  const now = new Date().toISOString();
  const passed: Item = {
    ...item,
    owner: curator.userId,
    path,
    position: nextPosition(await lastPositionIn(curator.userId, path)),
    file: item.file && { ...item.file, key: fileKey(curator.userId, item.id), size: 0, status: "pending" },
    updatedAt: now,
  };
  await saveItemChange(undefined, passed);
  // A file never uploaded has nothing in S3 to move: its item passes as it is.
  if (item.file?.status === "ready" && passed.file) await store.move(item.file.key, passed.file.key);
}

// Everything of the person goes: their items, folders, tags, views, usage, profile,
// and their files; with a curator given, what they shared passes to the curator first.
export async function purgePerson(
  person: ProfileRecord,
  store: PurgeStore,
  keepSharedTo?: Caller,
): Promise<{ kept: number; deleted: number; files: number }> {
  const items = await listOwnerItems(person.userId);
  let kept = 0;
  if (keepSharedTo) {
    const root = `from/${handleOf(person.email)}`;
    for (const item of items.filter((i) => i.shared)) {
      await passToCurator(item, keepSharedTo, root, store);
      kept += 1;
    }
  }
  await wipePerson(person.userId);
  const files = await store.removePrefix(`files/${person.userId}/`);
  return { kept, deleted: items.length, files };
}
