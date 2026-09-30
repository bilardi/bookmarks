import { beforeEach, describe, expect, it } from "vitest";

import { createItemBodySchema } from "@bookmarks/core";

import { buildExport, csvRow } from "../src/exporting";
import { readImport } from "../src/importing";
import { createItem } from "../src/operations/items";
import { setView } from "../src/operations/views";
import { findProfileByEmail, registerProfile } from "../src/repository/profiles";
import { markFileReady, getItem } from "../src/repository/items";
import { caller, wipeUsers } from "./helpers";

const A = caller("exporting-a", "Ada");
const B = caller("exporting-b", "Bob");

async function add(who = A, extra: Record<string, unknown> = {}) {
  const res = await createItem(who, createItemBodySchema.parse({ title: "t", ...extra }), false);
  if (!res.ok) throw new Error(res.error);
  return res.view;
}

async function ready(owner: string, id: string, size = 10) {
  await markFileReady((await getItem(owner, id))!, size);
}

beforeEach(async () => {
  await wipeUsers([A.userId, B.userId]);
});

describe("csvRow", () => {
  it("quotes a value with a comma, a quote or a newline", () => {
    expect(csvRow(["a", "b, c", 'say "hi"', "x\ny"])).toBe('a,"b, c","say ""hi""","x\ny"');
  });
});

describe("findProfileByEmail", () => {
  it("finds the profile whatever the case of the address", async () => {
    await registerProfile(A);
    expect((await findProfileByEmail(A.email.toUpperCase()))?.userId).toBe(A.userId);
    expect(await findProfileByEmail("nobody@test")).toBeNull();
  });
});

describe("buildExport", () => {
  it("exports a CSV the import reads back into the same items, with the personal view", async () => {
    const link = await add(A, { title: "Git, the book", link: "https://git-scm.com/", path: "docs", tags: ["git"], shared: true });
    await add(A, { title: "A note", text: 'with "quotes"' });
    await setView(A, A.userId, link.id, { seen: true, flag: false, note: "read again" });

    const plan = readImport((await buildExport(A.userId)).bookmarks);
    expect(plan.problems).toEqual([]);
    expect(plan.rows.map((r) => [r.body.title, r.body.link, r.body.text, r.body.path, r.body.tags, r.body.shared, r.view])).toEqual([
      ["A note", undefined, 'with "quotes"', "", [], false, undefined],
      ["Git, the book", "https://git-scm.com/", undefined, "docs", ["git"], true, { seen: true, flag: false, note: "read again" }],
    ]);
  });

  it("lists the files to put in the archive, where the column file says", async () => {
    const lesson = await add(A, { title: "Lesson 1", path: "course", file: { name: "01.mp3", contentType: "audio/mpeg" } });
    await ready(A.userId, lesson.id);

    const result = await buildExport(A.userId);
    expect(result.files).toEqual([{ key: `files/${A.userId}/${lesson.id}`, path: "course/01.mp3" }]);
    expect(readImport(result.bookmarks).rows[0].source).toBe("course/01.mp3");
  });

  it("names apart two files with the same name", async () => {
    const one = await add(A, { title: "One", file: { name: "01.mp3", contentType: "audio/mpeg" } });
    const two = await add(A, { title: "Two", file: { name: "01.mp3", contentType: "audio/mpeg" } });
    await ready(A.userId, one.id);
    await ready(A.userId, two.id);

    const paths = (await buildExport(A.userId)).files.map((f) => f.path).sort();
    expect(paths).toEqual(["01.mp3", `${two.id}-01.mp3`].sort());
  });

  it("gives the notes written on the items of others apart, with their title and nothing else of theirs", async () => {
    const noted = await add(B, { title: "Shared by Bob", link: "https://bob.test/", shared: true });
    const flagged = await add(B, { title: "Only flagged", link: "https://bob.test/2", shared: true });
    await setView(A, B.userId, noted.id, { seen: false, flag: true, note: "mine" });
    await setView(A, B.userId, flagged.id, { seen: true, flag: true, note: "" });

    const result = await buildExport(A.userId);
    expect(result.notesOnOthers.trim().split("\n")).toEqual(["title,note", "Shared by Bob,mine"]);
  });
});
