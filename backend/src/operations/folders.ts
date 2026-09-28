import { ancestors, isDirectChild, isInside, rebase } from "@bookmarks/core";
import type { FolderView } from "@bookmarks/core";

import { deleteFolderRecord, ensureFolders, getFolder, listFolders } from "../repository/folders";
import { listFolderItems, saveItemChange } from "../repository/items";
import { fail, ok, type Result } from "../result";
import type { Caller } from "../http";

// Without a path, every folder of the owner, for the list of the form; with a path,
// its direct children. Others see only folders with something shared, counted by
// what they can see.
export async function listFoldersOf(
  caller: Caller,
  owner: string,
  path: string | undefined,
): Promise<Result<FolderView[]>> {
  const own = owner === caller.userId;
  const folders = (await listFolders(owner))
    .filter((folder) => own || folder.sharedCount > 0)
    .filter((folder) => path === undefined || isDirectChild(folder.path, path))
    .map((folder) => (own ? folder : { ...folder, itemCount: folder.sharedCount }));
  return ok(folders);
}

export async function createFolder(caller: Caller, path: string): Promise<Result<FolderView>> {
  if (path === "") return fail("root-folder");
  if (await getFolder(caller.userId, path)) return fail("folder-exists");
  await ensureFolders(caller.userId, ancestors(path));
  return ok((await getFolder(caller.userId, path)) as FolderView);
}

// Every item moves with its own write, which also moves its counters from the old
// folders to the new ones: the positions stay, because the whole folder moves
// together into a place that is empty. The old records are then left at zero and
// removed.
export async function renameFolder(caller: Caller, from: string, to: string): Promise<Result<FolderView>> {
  if (from === "" || to === "") return fail("root-folder");
  if (isInside(to, from)) return fail("invalid-target");
  const owner = caller.userId;
  const folders = await listFolders(owner);
  if (!folders.some((folder) => folder.path === from)) return fail("not-found");
  if (folders.some((folder) => folder.path === to)) return fail("folder-exists");

  const moving = folders.filter((folder) => isInside(folder.path, from));
  await ensureFolders(owner, moving.flatMap((folder) => ancestors(rebase(folder.path, from, to))));
  const now = new Date().toISOString();
  for (const folder of moving) {
    for (const item of await listFolderItems(owner, folder.path)) {
      await saveItemChange(item, { ...item, path: rebase(item.path, from, to), updatedAt: now });
    }
  }
  for (const folder of moving) await deleteFolderRecord(owner, folder.path);
  return ok((await getFolder(owner, to)) as FolderView);
}

export async function shareFolder(caller: Caller, path: string, shared: boolean): Promise<Result<FolderView>> {
  const owner = caller.userId;
  const folders = (await listFolders(owner)).filter((folder) => isInside(folder.path, path));
  if (!folders.some((folder) => folder.path === path)) return fail("not-found");
  const now = new Date().toISOString();
  for (const folder of folders) {
    for (const item of await listFolderItems(owner, folder.path)) {
      // Unsharing a folder takes its items off the public page too.
      const next = shared ? { shared } : { shared, published: false };
      if (item.shared !== shared || (!shared && item.published)) {
        await saveItemChange(item, { ...item, ...next, updatedAt: now });
      }
    }
  }
  return ok((await getFolder(owner, path)) as FolderView);
}

export async function deleteFolder(caller: Caller, path: string): Promise<Result<{ path: string }>> {
  if (path === "") return fail("root-folder");
  const folders = await listFolders(caller.userId);
  const folder = folders.find((f) => f.path === path);
  if (!folder) return fail("not-found");
  const hasChildren = folders.some((f) => f.path !== path && isInside(f.path, path));
  if (folder.itemCount > 0 || hasChildren) return fail("folder-not-empty");
  await deleteFolderRecord(caller.userId, path);
  return ok({ path });
}
