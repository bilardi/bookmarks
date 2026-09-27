import { canRead } from "@bookmarks/core";
import type { DownloadView, UploadView } from "@bookmarks/core";

import { getItem, markFileReady } from "../repository/items";
import { addStoredBytes } from "../repository/profiles";
import { addUsage, currentMonth } from "../repository/usage";
import { fail, ok, type Result } from "../result";
import type { Caller } from "../http";
import type { Storage } from "../storage";

// A PUT is counted when the URL is signed; its bytes arrive with the S3 event.
export async function requestUpload(
  caller: Caller,
  id: string,
  storage: Storage,
  maxBytes: number,
): Promise<Result<UploadView>> {
  const item = await getItem(caller.userId, id);
  if (!item) return fail("not-found");
  if (!item.file) return fail("no-file");
  if (item.file.status === "ready") return fail("file-uploaded");
  const upload = await storage.presignUpload(item.file.key, item.file.contentType, maxBytes);
  await addUsage(caller.userId, currentMonth(), { putCount: 1 });
  return ok(upload);
}

// A GET is counted to whoever downloads, since they are the one who makes the
// cost, with the size of the object as the estimate of the traffic.
export async function requestDownload(
  caller: Caller,
  owner: string,
  id: string,
  storage: Storage,
): Promise<Result<DownloadView>> {
  const item = await getItem(owner, id);
  if (!item) return fail("not-found");
  if (!canRead(item, caller.userId)) return fail("forbidden");
  if (!item.file) return fail("no-file");
  if (item.file.status === "pending") return fail("file-pending");
  const url = await storage.presignDownload(item.file.key, item.file.name, item.file.contentType);
  await addUsage(caller.userId, currentMonth(), { getCount: 1, getBytes: item.file.size });
  return ok({ url });
}

const FILE_KEY = /^files\/([^/]+)\/([^/]+)$/;

// Only S3 knows the upload really happened, and how big the object is.
export async function fileCreated(key: string, size: number): Promise<void> {
  const match = FILE_KEY.exec(key);
  if (!match) return;
  const [, owner, id] = match;
  const item = await getItem(owner, id);
  if (!item?.file || item.file.key !== key) return;
  if (!(await markFileReady(item, size))) return;
  await addUsage(owner, currentMonth(), { putBytes: size });
  await addStoredBytes(owner, size);
}
