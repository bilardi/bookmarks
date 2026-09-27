import { PutCommand } from "@aws-sdk/lib-dynamodb";

import type { ViewState } from "@bookmarks/core";

import { batchGet, doc, TABLE_NAME } from "../dynamo";
import { userPk, viewSk } from "../keys";

export async function getViews(userId: string, itemIds: string[]): Promise<Map<string, ViewState>> {
  const records = await batchGet(itemIds.map((id) => ({ pk: userPk(userId), sk: viewSk(id) })));
  return new Map(
    records.map((r) => [
      String(r.itemId),
      { seen: Boolean(r.seen), flag: Boolean(r.flag), note: String(r.note ?? "") },
    ]),
  );
}

export async function putView(userId: string, itemId: string, state: ViewState): Promise<void> {
  await doc.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: { pk: userPk(userId), sk: viewSk(itemId), itemId, ...state, updatedAt: new Date().toISOString() },
    }),
  );
}
