import { parse } from "csv-parse/sync";

import { createItemBodySchema, viewBodySchema } from "@bookmarks/core";
import type { CreateItemBody, Item, ViewBody } from "@bookmarks/core";

import { fileKey } from "./keys";
import { createItem } from "./operations/items";
import { setView } from "./operations/views";
import { listFolderItems } from "./repository/items";
import type { Caller } from "./http";

// The columns an import may name: the fields of the form of the pages, and the
// personal view of the curator on the item, so an export imports back whole.
export const IMPORT_COLUMNS = [
  "title",
  "link",
  "file",
  "text",
  "path",
  "tags",
  "shared",
  "published",
  "seen",
  "flag",
  "note",
] as const;
const VIEW_COLUMNS: readonly string[] = ["seen", "flag", "note"];
type Column = (typeof IMPORT_COLUMNS)[number];

export interface ImportRow {
  line: number;
  body: CreateItemBody;
  // The path of the file under import/, when the row has one.
  source?: string;
  // Only when the file names a column of the view and the row fills one.
  view?: ViewBody;
}

export interface ImportPlan {
  rows: ImportRow[];
  problems: string[];
}

// What the import needs from S3, so that tests can stand in for it.
export interface ImportStore {
  // The type S3 recorded at the upload of import/<source>, or null when there is none.
  contentTypeOf(source: string): Promise<string | null>;
  exists(key: string): Promise<boolean>;
  // Copies import/<source> to the key, checks the copy, and only then deletes the
  // original; throws, leaving the original, when the copy does not check out.
  move(source: string, key: string): Promise<void>;
}

// A placeholder until S3 says the real type: the schema wants one to validate.
const UNKNOWN_TYPE = "application/octet-stream";

function flag(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

// The whole file is read and checked before anything is written: a problem on the
// last row must not leave the first ones created.
export function readImport(text: string): ImportPlan {
  const problems: string[] = [];
  const records = parse(text, { columns: true, bom: true, skip_empty_lines: true }) as Record<string, string>[];
  const header = records.length > 0 ? Object.keys(records[0]) : (text.replace(/^﻿/, "").split(/\r?\n/)[0] ?? "").split(",");
  for (const column of header) {
    if (!(IMPORT_COLUMNS as readonly string[]).includes(column)) problems.push(`unknown column: ${column}`);
  }
  if (problems.length > 0) return { rows: [], problems };

  const rows: ImportRow[] = [];
  records.forEach((record, index) => {
    const line = index + 2;
    const value = (column: Column): string | undefined => {
      const v = record[column]?.trim();
      return v === undefined || v === "" ? undefined : v;
    };
    const source = value("file");
    const parsed = createItemBodySchema.safeParse({
      title: value("title") ?? "",
      text: value("text"),
      link: value("link"),
      file: source && { name: source.split("/").pop() as string, contentType: UNKNOWN_TYPE },
      path: value("path") ?? "",
      tags: (value("tags") ?? "").split(/\s+/).filter((t) => t.length > 0),
      shared: flag(value("shared")),
      published: flag(value("published")),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      problems.push(`line ${line}: ${issue.path.length > 0 ? String(issue.path[0]) : issue.message}`);
      return;
    }
    let view: ViewBody | undefined;
    if (header.some((column) => VIEW_COLUMNS.includes(column)) && (value("seen") || value("flag") || value("note"))) {
      const state = viewBodySchema.safeParse({ seen: flag(value("seen")), flag: flag(value("flag")), note: value("note") ?? "" });
      if (!state.success) {
        problems.push(`line ${line}: ${String(state.error.issues[0].path[0] ?? state.error.issues[0].message)}`);
        return;
      }
      view = state.data;
    }
    rows.push({ line, body: parsed.data, source, view });
  });
  return { rows, problems };
}

// What is already in the folder under the title of the row, if anything.
function sameTitle(folder: Item[], row: ImportRow): Item | undefined {
  return folder.find((item) => item.title === row.body.title);
}

// Whether the file of a row still has to come from import/: a new row, or an item
// left pending by a cut run whose copy never landed.
async function needsSource(row: ImportRow, existing: Item | undefined, store: ImportStore): Promise<boolean> {
  if (row.source === undefined) return false;
  if (existing === undefined) return true;
  return existing.file?.status === "pending" && !(await store.exists(existing.file.key));
}

// First every file still needed is looked for, so a missing one stops the import
// before the first write; then the rows in their order, skipping a title already
// in its folder, and moving the file of an item left pending by a cut run.
export async function runImport(
  caller: Caller,
  plan: ImportPlan,
  store: ImportStore,
): Promise<{ created: number; skipped: number; problems: string[] }> {
  if (plan.problems.length > 0) return { created: 0, skipped: 0, problems: plan.problems };

  const folders = new Map<string, Item[]>();
  for (const row of plan.rows) {
    if (!folders.has(row.body.path)) folders.set(row.body.path, await listFolderItems(caller.userId, row.body.path));
  }

  const types = new Map<number, string>();
  const problems: string[] = [];
  for (const row of plan.rows) {
    const existing = sameTitle(folders.get(row.body.path) as Item[], row);
    if (!(await needsSource(row, existing, store))) continue;
    const type = await store.contentTypeOf(row.source as string);
    if (type === null) problems.push(`line ${row.line}: no import/${row.source}`);
    else types.set(row.line, type);
  }
  if (problems.length > 0) return { created: 0, skipped: 0, problems };

  let created = 0;
  let skipped = 0;
  for (const row of plan.rows) {
    const folder = folders.get(row.body.path) as Item[];
    const existing = sameTitle(folder, row);
    if (existing) {
      skipped += 1;
      if (types.has(row.line) && existing.file) await store.move(row.source as string, existing.file.key);
      continue;
    }
    const body = row.body.file ? { ...row.body, file: { ...row.body.file, contentType: types.get(row.line) as string } } : row.body;
    const res = await createItem(caller, body, true);
    if (!res.ok) throw new Error(`line ${row.line}: ${res.error}`);
    const key = fileKey(caller.userId, res.view.id);
    // Remembered before the move, so a second row with the same title is skipped,
    // and the item is known to be there even if the move fails.
    folder.push({
      ...body,
      id: res.view.id,
      owner: caller.userId,
      position: res.view.position,
      file: body.file && { key, name: body.file.name, size: 0, contentType: body.file.contentType, status: "pending" },
      createdAt: res.view.createdAt,
      updatedAt: res.view.updatedAt,
    });
    if (row.source !== undefined) await store.move(row.source, key);
    if (row.view !== undefined) await setView(caller, caller.userId, res.view.id, row.view);
    created += 1;
  }
  return { created, skipped, problems: [] };
}
