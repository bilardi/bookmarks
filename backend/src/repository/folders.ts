import { DeleteCommand, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

import { doc, queryAll, TABLE_NAME } from "../dynamo";
import { FOLDER_PREFIX, folderSk, userPk } from "../keys";

// The counters cover the whole subtree: a folder shows as shared when anything
// below it is.
export interface FolderRecord {
  path: string;
  itemCount: number;
  sharedCount: number;
}

function folderFrom(r: Record<string, unknown>): FolderRecord {
  return { path: String(r.path), itemCount: Number(r.itemCount ?? 0), sharedCount: Number(r.sharedCount ?? 0) };
}

// Sorted by path, so a parent always comes before its children.
export async function listFolders(owner: string): Promise<FolderRecord[]> {
  const records = await queryAll({
    TableName: TABLE_NAME,
    KeyConditionExpression: "pk = :pk AND begins_with(sk, :folder)",
    ExpressionAttributeValues: { ":pk": userPk(owner), ":folder": FOLDER_PREFIX },
  });
  return records.map(folderFrom);
}

export async function getFolder(owner: string, path: string): Promise<FolderRecord | null> {
  const res = await doc.send(new GetCommand({ TableName: TABLE_NAME, Key: { pk: userPk(owner), sk: folderSk(path) } }));
  return res.Item ? folderFrom(res.Item) : null;
}

export async function ensureFolders(owner: string, paths: string[]): Promise<void> {
  for (const path of new Set(paths)) {
    await doc.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { pk: userPk(owner), sk: folderSk(path) },
        UpdateExpression: "SET #path = :path ADD itemCount :zero, sharedCount :zero",
        ExpressionAttributeNames: { "#path": "path" },
        ExpressionAttributeValues: { ":path": path, ":zero": 0 },
      }),
    );
  }
}

export async function deleteFolderRecord(owner: string, path: string): Promise<void> {
  await doc.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { pk: userPk(owner), sk: folderSk(path) } }));
}
