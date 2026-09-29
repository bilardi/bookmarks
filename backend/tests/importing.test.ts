import { beforeEach, describe, expect, it } from "vitest";

import { readImport, runImport, type ImportStore } from "../src/importing";
import { listFolder } from "../src/operations/items";
import { getItem } from "../src/repository/items";
import { caller, wipeUsers } from "./helpers";

const CURATOR = caller("importing-curator", "Curator");

// A bucket in memory: what is under import/, with its type, and the keys the
// moves wrote. A move takes the original away, as the real one does.
function fakeStore(files: Record<string, string>): ImportStore & { moves: [string, string][]; keys: Set<string> } {
  const moves: [string, string][] = [];
  const keys = new Set<string>();
  return {
    moves,
    keys,
    contentTypeOf: async (source) => files[source] ?? null,
    exists: async (key) => keys.has(key),
    move: async (source, key) => {
      moves.push([source, key]);
      keys.add(key);
      delete files[source];
    },
  };
}

async function titles(path: string): Promise<string[]> {
  const res = await listFolder(CURATOR, CURATOR.userId, path);
  return res.ok ? res.view.map((i) => i.title) : [];
}

beforeEach(async () => {
  await wipeUsers([CURATOR.userId]);
});

describe("readImport", () => {
  it("reads only the columns of the header", () => {
    const plan = readImport("title,link,tags,published\nGit,https://git-scm.com/,bash linux,true\n");
    expect(plan.problems).toEqual([]);
    expect(plan.rows).toEqual([
      {
        line: 2,
        // shared stays as the file says: createItem is what shares a published item.
        body: { title: "Git", link: "https://git-scm.com/", path: "", tags: ["bash", "linux"], shared: false, published: true },
      },
    ]);
  });

  it("reads a file saved by a spreadsheet", () => {
    const plan = readImport('﻿title,link\r\n"Tmux, the tips",https://tmux.test/\r\n');
    expect(plan.problems).toEqual([]);
    expect(plan.rows.map((r) => r.body.title)).toEqual(["Tmux, the tips"]);
  });

  it("refuses a column it does not know", () => {
    expect(readImport("title,colour\nA,red\n").problems).toEqual(["unknown column: colour"]);
  });

  it("stops before writing on a row that is not valid", () => {
    const plan = readImport("title,published\nA note,true\n,false\n");
    expect(plan.problems).toEqual(["line 2: public-needs-link", "line 3: title"]);
  });

  it("reads the personal view only when the file names one of its columns", () => {
    const plan = readImport("title,link,seen,flag,note\nGit,https://git-scm.com/,true,,to read again\nTmux,https://tmux.test/,,,\n");
    expect(plan.rows.map((r) => r.view)).toEqual([{ seen: true, flag: false, note: "to read again" }, undefined]);
    expect(readImport("title,link\nGit,https://git-scm.com/\n").rows[0].view).toBeUndefined();
  });

  it("refuses a note over 250 characters", () => {
    expect(readImport(`title,note\nA,${"x".repeat(251)}\n`).problems).toEqual(["line 2: note"]);
  });

  it("keeps the file apart, to look for it under import/", () => {
    const plan = readImport("title,file,path\nLesson 1,english/basic/01.mp3,lessons/english\n");
    expect(plan.rows[0].source).toBe("english/basic/01.mp3");
    expect(plan.rows[0].body.file?.name).toBe("01.mp3");
  });
});

describe("runImport", () => {
  it("creates the rows in the order of the file, and moves each file to its item", async () => {
    const plan = readImport("title,file,path,shared\nLesson 1,en/01.mp3,course,true\nLesson 2,en/02.mp3,course,true\n");
    const store = fakeStore({ "en/01.mp3": "audio/mpeg", "en/02.mp3": "audio/mpeg" });

    expect(await runImport(CURATOR, plan, store)).toEqual({ created: 2, skipped: 0, problems: [] });
    expect(await titles("course")).toEqual(["Lesson 1", "Lesson 2"]);
    expect(store.moves.map(([source, key]) => [source, key.startsWith(`files/${CURATOR.userId}/`)])).toEqual([
      ["en/01.mp3", true],
      ["en/02.mp3", true],
    ]);
  });

  it("stops before writing when a file is missing", async () => {
    const plan = readImport("title,file\nLesson 1,en/01.mp3\nLesson 2,en/missing.mp3\n");
    const result = await runImport(CURATOR, plan, fakeStore({ "en/01.mp3": "audio/mpeg" }));
    expect(result).toEqual({ created: 0, skipped: 0, problems: ["line 3: no import/en/missing.mp3"] });
    expect(await titles("")).toEqual([]);
  });

  it("runs again on the same file, whose files have left import/, creating nothing", async () => {
    const plan = readImport("title,link\nGit,https://git-scm.com/\n");
    await runImport(CURATOR, plan, fakeStore({}));
    expect(await runImport(CURATOR, plan, fakeStore({}))).toEqual({ created: 0, skipped: 1, problems: [] });
    expect(await titles("")).toEqual(["Git"]);
  });

  it("writes the personal view of a new row, and leaves alone the one of a skipped row", async () => {
    await runImport(CURATOR, readImport("title,link,flag,note\nGit,https://git-scm.com/,true,first\n"), fakeStore({}));
    await runImport(CURATOR, readImport("title,link,note\nGit,https://git-scm.com/,second\n"), fakeStore({}));
    const res = await listFolder(CURATOR, CURATOR.userId, "");
    expect(res.ok && res.view.map((i) => i.view)).toEqual([{ seen: false, flag: true, note: "first" }]);
  });

  it("skips a title repeated in the same file", async () => {
    const plan = readImport("title,link\nGit,https://git-scm.com/\nGit,https://git-scm.com/book/\n");
    expect(await runImport(CURATOR, plan, fakeStore({}))).toEqual({ created: 1, skipped: 1, problems: [] });
  });

  it("does not look again for a file already moved, even while its item waits for S3", async () => {
    const plan = readImport("title,file\nLesson 1,en/01.mp3\n");
    const store = fakeStore({ "en/01.mp3": "audio/mpeg" });
    await runImport(CURATOR, plan, store);
    // No S3 event in the tests: the item stays pending, and the original is gone.
    expect(await runImport(CURATOR, plan, store)).toEqual({ created: 0, skipped: 1, problems: [] });
    expect(store.moves).toHaveLength(1);
  });

  it("moves the file of an item left pending by a cut run", async () => {
    const plan = readImport("title,file\nLesson 1,en/01.mp3\n");
    // A store that creates the item but never receives the file, as a cut run.
    const cut = fakeStore({ "en/01.mp3": "audio/mpeg" });
    cut.move = async () => {
      throw new Error("cut");
    };
    await expect(runImport(CURATOR, plan, cut)).rejects.toThrow("cut");

    const store = fakeStore({ "en/01.mp3": "audio/mpeg" });
    expect(await runImport(CURATOR, plan, store)).toEqual({ created: 0, skipped: 1, problems: [] });
    expect(store.moves).toHaveLength(1);
    const [, key] = store.moves[0];
    const item = await getItem(CURATOR.userId, key.split("/")[2]);
    expect(item?.file?.contentType).toBe("audio/mpeg");
  });
});
