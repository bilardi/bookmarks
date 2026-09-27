import { beforeEach, describe, expect, it } from "vitest";

import { createItemBodySchema } from "@bookmarks/core";

import {
  createFolder,
  deleteFolder,
  listFoldersOf,
  renameFolder,
  shareFolder,
} from "../src/operations/folders";
import { createItem, listFolder } from "../src/operations/items";
import { caller, wipeUsers } from "./helpers";

const A = caller("ops-folders-a");

async function add(title: string, path: string) {
  const res = await createItem(A, createItemBodySchema.parse({ title, path }));
  if (!res.ok) throw new Error(res.error);
  return res.view;
}

async function paths(): Promise<string[]> {
  const res = await listFoldersOf(A, A.userId, undefined);
  return res.ok ? res.view.map((f) => f.path) : [];
}

beforeEach(async () => {
  await wipeUsers([A.userId]);
});

describe("createFolder", () => {
  it("creates an empty folder and every folder above it", async () => {
    expect(await createFolder(A, "a/b")).toEqual({ ok: true, view: { path: "a/b", itemCount: 0, sharedCount: 0 } });
    expect(await paths()).toEqual(["", "a", "a/b"]);
  });

  it("refuses the root and a folder that exists", async () => {
    await createFolder(A, "a");
    expect(await createFolder(A, "")).toEqual({ ok: false, error: "root-folder" });
    expect(await createFolder(A, "a")).toEqual({ ok: false, error: "folder-exists" });
  });
});

describe("listFoldersOf", () => {
  it("lists the direct children of a folder", async () => {
    await add("x", "a/b");
    await createFolder(A, "a/c");
    await createFolder(A, "a/b/d");
    const res = await listFoldersOf(A, A.userId, "a");
    expect(res.ok && res.view.map((f) => [f.path, f.itemCount])).toEqual([
      ["a/b", 1],
      ["a/c", 0],
    ]);
  });
});

describe("renameFolder", () => {
  it("renames nested and empty folders", async () => {
    await add("x", "a/b");
    await add("y", "a/b/c");
    await createFolder(A, "a/b/d");

    const res = await renameFolder(A, "a/b", "z");

    expect(res).toEqual({ ok: true, view: { path: "z", itemCount: 2, sharedCount: 0 } });
    expect(await paths()).toEqual(["", "a", "z", "z/c", "z/d"]);
    const z = await listFolder(A, A.userId, "z");
    expect(z.ok && z.view.map((i) => [i.title, i.path])).toEqual([["x", "z"]]);
    const zc = await listFolder(A, A.userId, "z/c");
    expect(zc.ok && zc.view.map((i) => [i.title, i.path])).toEqual([["y", "z/c"]]);
    const old = await listFolder(A, A.userId, "a/b");
    expect(old.ok && old.view).toEqual([]);
  });

  it("refuses the root, a destination inside itself and one that exists", async () => {
    await add("x", "a");
    await createFolder(A, "b");
    expect(await renameFolder(A, "", "x")).toEqual({ ok: false, error: "root-folder" });
    expect(await renameFolder(A, "a", "a/q")).toEqual({ ok: false, error: "invalid-target" });
    expect(await renameFolder(A, "a", "b")).toEqual({ ok: false, error: "folder-exists" });
    expect(await renameFolder(A, "missing", "q")).toEqual({ ok: false, error: "not-found" });
  });
});

describe("shareFolder", () => {
  it("shares every item of the subtree", async () => {
    await add("x", "a");
    await add("y", "a/b");
    await add("z", "c");
    expect(await shareFolder(A, "a", true)).toEqual({ ok: true, view: { path: "a", itemCount: 2, sharedCount: 2 } });
    const res = await listFoldersOf(A, A.userId, "");
    expect(res.ok && res.view.map((f) => [f.path, f.sharedCount])).toEqual([
      ["a", 2],
      ["c", 0],
    ]);
  });
});

describe("deleteFolder", () => {
  it("deletes only an empty folder without subfolders", async () => {
    await add("x", "a");
    await createFolder(A, "b/c");
    expect(await deleteFolder(A, "a")).toEqual({ ok: false, error: "folder-not-empty" });
    expect(await deleteFolder(A, "b")).toEqual({ ok: false, error: "folder-not-empty" });
    expect(await deleteFolder(A, "b/c")).toEqual({ ok: true, view: { path: "b/c" } });
    expect(await deleteFolder(A, "")).toEqual({ ok: false, error: "root-folder" });
    expect(await deleteFolder(A, "missing")).toEqual({ ok: false, error: "not-found" });
  });
});
