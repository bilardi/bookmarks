import { beforeEach, describe, expect, it } from "vitest";

import { createItemBodySchema } from "@bookmarks/core";

import { fileCreated, requestDownload, requestUpload } from "../src/operations/files";
import { createItem, deleteItem } from "../src/operations/items";
import { getMe } from "../src/operations/me";
import { getProfileRecord } from "../src/repository/profiles";
import { currentMonth, listUsage } from "../src/repository/usage";
import { caller, wipeUsers } from "./helpers";
import { fakeStorage } from "./fakeStorage";

const OWNER = caller("ops-files-owner");
const VIEWER = caller("ops-files-viewer");
const MAX = 200 * 1024 * 1024;

async function addFile(shared = false) {
  const body = createItemBodySchema.parse({
    title: "lesson",
    shared,
    file: { name: "l1.mp3", contentType: "audio/mpeg" },
  });
  const res = await createItem(OWNER, body);
  if (!res.ok) throw new Error(res.error);
  return res.view;
}

beforeEach(async () => {
  await wipeUsers([OWNER.userId, VIEWER.userId]);
  await getMe(OWNER, "");
});

describe("upload and S3 event", () => {
  it("signs an upload, then marks the file ready and counts its bytes", async () => {
    const storage = fakeStorage();
    const item = await addFile();
    const key = `files/${OWNER.userId}/${item.id}`;

    const upload = await requestUpload(OWNER, item.id, storage, MAX);
    expect(upload).toEqual({
      ok: true,
      view: { url: "https://upload.test/", fields: { key, "Content-Type": "audio/mpeg", max: String(MAX) } },
    });
    expect(await requestDownload(OWNER, OWNER.userId, item.id, storage)).toEqual({ ok: false, error: "file-pending" });

    await fileCreated(key, 1000);

    expect((await getProfileRecord(OWNER.userId)).storedBytes).toBe(1000);
    expect(await listUsage(OWNER.userId)).toEqual([
      { month: currentMonth(), getCount: 0, getBytes: 0, putCount: 1, putBytes: 1000 },
    ]);
    expect(await requestUpload(OWNER, item.id, storage, MAX)).toEqual({ ok: false, error: "file-uploaded" });
  });

  it("counts a repeated event once", async () => {
    const item = await addFile();
    const key = `files/${OWNER.userId}/${item.id}`;
    await fileCreated(key, 1000);
    await fileCreated(key, 1000);
    expect((await getProfileRecord(OWNER.userId)).storedBytes).toBe(1000);
  });

  it("ignores a key that belongs to no item", async () => {
    await fileCreated("files/nobody/nothing", 10);
    await fileCreated("elsewhere/key", 10);
  });

  it("gives the bytes back when the item is deleted", async () => {
    const item = await addFile();
    await fileCreated(`files/${OWNER.userId}/${item.id}`, 1000);
    await deleteItem(OWNER, item.id, fakeStorage());
    expect((await getProfileRecord(OWNER.userId)).storedBytes).toBe(0);
  });
});

describe("download", () => {
  it("signs a download for whoever can read, and counts it to them", async () => {
    const storage = fakeStorage();
    const item = await addFile(true);
    await fileCreated(`files/${OWNER.userId}/${item.id}`, 1000);

    const res = await requestDownload(VIEWER, OWNER.userId, item.id, storage);
    expect(res.ok && res.view.url).toBe(`https://download.test/files/${OWNER.userId}/${item.id}?name=l1.mp3`);
    expect(await listUsage(VIEWER.userId)).toEqual([
      { month: currentMonth(), getCount: 1, getBytes: 1000, putCount: 0, putBytes: 0 },
    ]);
  });

  it("refuses an unshared item and signs nothing", async () => {
    const item = await addFile(false);
    await fileCreated(`files/${OWNER.userId}/${item.id}`, 1000);
    expect(await requestDownload(VIEWER, OWNER.userId, item.id, fakeStorage())).toEqual({ ok: false, error: "forbidden" });
    expect(await listUsage(VIEWER.userId)).toEqual([]);
  });

  it("refuses an item without a file", async () => {
    const note = await createItem(OWNER, createItemBodySchema.parse({ title: "note" }));
    if (!note.ok) throw new Error(note.error);
    expect(await requestDownload(OWNER, OWNER.userId, note.view.id, fakeStorage())).toEqual({ ok: false, error: "no-file" });
  });
});
