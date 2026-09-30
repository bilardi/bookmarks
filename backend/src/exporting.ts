import { ScanCommand } from "@aws-sdk/lib-dynamodb";

import type { Item } from "@bookmarks/core";

import { doc, queryAll, TABLE_NAME } from "./dynamo";
import { IMPORT_COLUMNS } from "./importing";
import { itemFrom, listOwnerItems } from "./repository/items";
import { getViews } from "./repository/views";
import { userPk, viewSk } from "./keys";

export interface ExportFile {
  // Where the file is in the bucket, and where it goes in the archive under files/.
  key: string;
  path: string;
}

// A value with a comma, a quote or a newline goes between quotes, and a quote in
// it is written twice: what csv-parse reads back as the same value.
export function csvRow(values: string[]): string {
  return values.map((v) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(",");
}

function csv(header: readonly string[], rows: string[][]): string {
  return [csvRow([...header]), ...rows.map(csvRow)].join("\n") + "\n";
}

// The items of others the person wrote a note on: their views carry only the id,
// so the items are found by a scan, which the curator alone runs.
async function itemsById(ids: Set<string>): Promise<Item[]> {
  const found: Item[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const res = await doc.send(
      new ScanCommand({ TableName: TABLE_NAME, FilterExpression: "begins_with(sk, :item)", ExpressionAttributeValues: { ":item": "ITEM#" }, ExclusiveStartKey: start }),
    );
    for (const r of res.Items ?? []) if (ids.has(String(r.id))) found.push(itemFrom(r));
    start = res.LastEvaluatedKey;
  } while (start);
  return found;
}

// Everything of a person, as files: bookmarks.csv in the format of the import, the
// list of their files, and the notes they wrote on what others shared, with the
// title only: the link, the text and the name of the owner belong to somebody else.
export async function buildExport(sub: string): Promise<{ bookmarks: string; notesOnOthers: string; files: ExportFile[] }> {
  const items = (await listOwnerItems(sub)).sort((a, b) =>
    a.path === b.path ? a.position - b.position : a.path < b.path ? -1 : 1,
  );
  const views = await getViews(sub, items.map((i) => i.id));

  const files: ExportFile[] = [];
  const taken = new Set<string>();
  const rows = items.map((item) => {
    let file = "";
    if (item.file?.status === "ready") {
      const folder = item.path === "" ? "" : `${item.path}/`;
      file = `${folder}${item.file.name}`;
      if (taken.has(file)) file = `${folder}${item.id}-${item.file.name}`;
      taken.add(file);
      files.push({ key: item.file.key, path: file });
    }
    const view = views.get(item.id);
    const values: Record<(typeof IMPORT_COLUMNS)[number], string> = {
      title: item.title,
      link: item.link ?? "",
      file,
      text: item.text ?? "",
      path: item.path,
      tags: item.tags.join(" "),
      shared: String(item.shared),
      published: String(item.published === true),
      seen: view ? String(view.seen) : "",
      flag: view ? String(view.flag) : "",
      note: view?.note ?? "",
    };
    return IMPORT_COLUMNS.map((column) => values[column]);
  });

  const ownViews = await queryAll({
    TableName: TABLE_NAME,
    KeyConditionExpression: "pk = :pk AND begins_with(sk, :view)",
    ExpressionAttributeValues: { ":pk": userPk(sub), ":view": viewSk("") },
  });
  const own = new Set(items.map((i) => i.id));
  const others = ownViews.filter((v) => !own.has(String(v.itemId)) && String(v.note ?? "") !== "");
  const found = new Map((await itemsById(new Set(others.map((v) => String(v.itemId))))).map((i) => [i.id, i]));
  const notes = others
    .filter((v) => found.has(String(v.itemId)))
    .map((v) => [(found.get(String(v.itemId)) as Item).title, String(v.note)]);

  return { bookmarks: csv(IMPORT_COLUMNS, rows), notesOnOthers: csv(["title", "note"], notes), files };
}
