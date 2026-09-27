import { GetCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { TransactWriteCommandInput } from "@aws-sdk/lib-dynamodb";

import type { Item } from "@bookmarks/core";

import { counterDeltas, sharedDelta, type CounterDelta } from "../counters";
import { batchGet, doc, queryAll, TABLE_NAME } from "../dynamo";
import { FOLDER_PREFIX, itemSk, pathGsiPk, PROFILE_SK, tagMemberPk, userPk } from "../keys";
import { syncOwnerIndex } from "./profiles";

type TransactItem = NonNullable<TransactWriteCommandInput["TransactItems"]>[number];

// gsi1 holds the folder and the position, so a folder comes back already in order.
function itemRecord(item: Item): Record<string, unknown> {
  return {
    pk: userPk(item.owner),
    sk: itemSk(item.id),
    gsi1pk: pathGsiPk(item.owner, item.path),
    gsi1sk: item.position,
    ...item,
  };
}

export function itemFrom(record: Record<string, unknown>): Item {
  const { pk: _pk, sk: _sk, gsi1pk: _gsi1pk, gsi1sk: _gsi1sk, ...item } = record;
  return item as unknown as Item;
}

// A folder counter carries its path and a tag counter its name, so either can be
// listed without parsing the key.
function counterUpdate(pk: string, sk: string, delta: CounterDelta): TransactItem {
  const folder = sk.startsWith(FOLDER_PREFIX);
  return {
    Update: {
      TableName: TABLE_NAME,
      Key: { pk, sk },
      UpdateExpression: "SET #label = :label ADD itemCount :items, sharedCount :shared",
      ExpressionAttributeNames: { "#label": folder ? "path" : "name" },
      ExpressionAttributeValues: {
        ":label": sk.slice(sk.indexOf("#") + 1),
        ":items": delta.items,
        ":shared": delta.shared,
      },
    },
  };
}

// One transaction for the item, the counters of its folders and tags, the members
// of its tags and the shared counter of the owner: they can never disagree.
export async function saveItemChange(before: Item | undefined, after: Item | undefined): Promise<void> {
  const current = (after ?? before) as Item;
  const pk = userPk(current.owner);
  const ops: TransactItem[] = [];

  if (after) {
    ops.push({
      Put: {
        TableName: TABLE_NAME,
        Item: itemRecord(after),
        ConditionExpression: before ? "attribute_exists(sk)" : "attribute_not_exists(sk)",
      },
    });
  } else {
    ops.push({ Delete: { TableName: TABLE_NAME, Key: { pk, sk: itemSk(current.id) } } });
  }

  for (const [sk, delta] of counterDeltas(before, after)) ops.push(counterUpdate(pk, sk, delta));

  const oldTags = new Set(before?.tags ?? []);
  const newTags = new Set(after?.tags ?? []);
  for (const tag of newTags) {
    if (!oldTags.has(tag)) {
      ops.push({ Put: { TableName: TABLE_NAME, Item: { pk: tagMemberPk(current.owner, tag), sk: itemSk(current.id) } } });
    }
  }
  for (const tag of oldTags) {
    if (!newTags.has(tag)) {
      ops.push({ Delete: { TableName: TABLE_NAME, Key: { pk: tagMemberPk(current.owner, tag), sk: itemSk(current.id) } } });
    }
  }

  const shared = sharedDelta(before, after);
  if (shared !== 0) {
    ops.push({
      Update: {
        TableName: TABLE_NAME,
        Key: { pk, sk: PROFILE_SK },
        UpdateExpression: "ADD sharedCount :delta",
        ExpressionAttributeValues: { ":delta": shared },
      },
    });
  }

  await doc.send(new TransactWriteCommand({ TransactItems: ops }));
  if (shared !== 0) await syncOwnerIndex(current.owner);
}

export async function getItem(owner: string, id: string): Promise<Item | null> {
  const res = await doc.send(new GetCommand({ TableName: TABLE_NAME, Key: { pk: userPk(owner), sk: itemSk(id) } }));
  return res.Item ? itemFrom(res.Item) : null;
}

export async function lastPositionIn(owner: string, path: string): Promise<number | undefined> {
  const res = await doc.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "gsi1",
      KeyConditionExpression: "gsi1pk = :pk",
      ExpressionAttributeValues: { ":pk": pathGsiPk(owner, path) },
      ScanIndexForward: false,
      Limit: 1,
    }),
  );
  const last = res.Items?.[0]?.gsi1sk;
  return last === undefined ? undefined : Number(last);
}

// The item right before or right after a position, in the whole folder: hidden
// items count, because a move must not jump over them.
export async function neighbor(
  owner: string,
  path: string,
  position: number,
  side: "before" | "after",
): Promise<Item | undefined> {
  const res = await doc.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "gsi1",
      KeyConditionExpression: `gsi1pk = :pk AND gsi1sk ${side === "before" ? "<" : ">"} :position`,
      ExpressionAttributeValues: { ":pk": pathGsiPk(owner, path), ":position": position },
      ScanIndexForward: side === "after",
      Limit: 1,
    }),
  );
  const record = res.Items?.[0];
  return record ? itemFrom(record) : undefined;
}

export async function listFolderItems(owner: string, path: string): Promise<Item[]> {
  const records = await queryAll({
    TableName: TABLE_NAME,
    IndexName: "gsi1",
    KeyConditionExpression: "gsi1pk = :pk",
    ExpressionAttributeValues: { ":pk": pathGsiPk(owner, path) },
  });
  return records.map(itemFrom);
}

export async function setPosition(item: Item, position: number): Promise<void> {
  await doc.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: userPk(item.owner), sk: itemSk(item.id) },
      UpdateExpression: "SET #position = :position, gsi1sk = :position",
      ConditionExpression: "attribute_exists(sk)",
      ExpressionAttributeNames: { "#position": "position" },
      ExpressionAttributeValues: { ":position": position },
    }),
  );
}

// Integers again, in the current order: needed only when fractions run out of room.
export async function renumberFolder(owner: string, path: string): Promise<void> {
  const items = await listFolderItems(owner, path);
  for (const [i, item] of items.entries()) await setPosition(item, i + 1);
}

export async function itemsByIds(owner: string, ids: string[]): Promise<Item[]> {
  const records = await batchGet(ids.map((id) => ({ pk: userPk(owner), sk: itemSk(id) })));
  return records.map(itemFrom);
}

// S3 may deliver the same event twice: the condition lets only the first one count.
export async function markFileReady(item: Item, size: number): Promise<boolean> {
  try {
    await doc.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { pk: userPk(item.owner), sk: itemSk(item.id) },
        UpdateExpression: "SET #file.#size = :size, #file.#status = :ready",
        ConditionExpression: "#file.#status = :pending",
        ExpressionAttributeNames: { "#file": "file", "#size": "size", "#status": "status" },
        ExpressionAttributeValues: { ":size": size, ":ready": "ready", ":pending": "pending" },
      }),
    );
    return true;
  } catch (err) {
    if ((err as { name?: string }).name === "ConditionalCheckFailedException") return false;
    throw err;
  }
}
