import { GetCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

import type { OwnerView } from "@bookmarks/core";

import { doc, queryAll, TABLE_NAME } from "../dynamo";
import { OWNERS_PK, PROFILE_SK, userPk } from "../keys";
import type { Caller } from "../http";

export interface ProfileRecord {
  userId: string;
  name: string;
  email: string;
  sharedCount: number;
  storedBytes: number;
}

// ADD with zero creates a counter that is missing and leaves alone one that is
// there: the same call serves the first access and every later one.
export async function registerProfile(caller: Caller): Promise<void> {
  await doc.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: userPk(caller.userId), sk: PROFILE_SK },
      UpdateExpression: "SET userId = :id, #name = :name, #email = :email ADD sharedCount :zero, storedBytes :zero",
      ExpressionAttributeNames: { "#name": "name", "#email": "email" },
      ExpressionAttributeValues: { ":id": caller.userId, ":name": caller.name, ":email": caller.email, ":zero": 0 },
    }),
  );
}

export async function getProfileRecord(sub: string): Promise<ProfileRecord> {
  const res = await doc.send(new GetCommand({ TableName: TABLE_NAME, Key: { pk: userPk(sub), sk: PROFILE_SK } }));
  const item = res.Item ?? {};
  return {
    userId: sub,
    name: String(item.name ?? ""),
    email: String(item.email ?? ""),
    sharedCount: Number(item.sharedCount ?? 0),
    storedBytes: Number(item.storedBytes ?? 0),
  };
}

// gsi2 is sparse: a profile is in it only while it shares something, so the list
// of owners is one query that never reads who shares nothing. The flag is set
// after the write that changed the counter, and every later write sets it again.
export async function syncOwnerIndex(sub: string): Promise<void> {
  const profile = await getProfileRecord(sub);
  const key = { pk: userPk(sub), sk: PROFILE_SK };
  if (profile.sharedCount > 0) {
    await doc.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: key,
        UpdateExpression: "SET gsi2pk = :owners, gsi2sk = :id, userId = :id",
        ExpressionAttributeValues: { ":owners": OWNERS_PK, ":id": sub },
      }),
    );
  } else {
    await doc.send(
      new UpdateCommand({ TableName: TABLE_NAME, Key: key, UpdateExpression: "REMOVE gsi2pk, gsi2sk" }),
    );
  }
}

export async function listOwners(): Promise<OwnerView[]> {
  const records = await queryAll({
    TableName: TABLE_NAME,
    IndexName: "gsi2",
    KeyConditionExpression: "gsi2pk = :owners",
    ExpressionAttributeValues: { ":owners": OWNERS_PK },
  });
  return records.map((r) => ({ userId: String(r.userId), name: String(r.name ?? "") }));
}

export async function addStoredBytes(sub: string, delta: number): Promise<void> {
  await doc.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: userPk(sub), sk: PROFILE_SK },
      UpdateExpression: "ADD storedBytes :delta",
      ExpressionAttributeValues: { ":delta": delta },
    }),
  );
}

// For the curator only, from the command line: the person may be banned, so the
// pool no longer knows them, while their profile still holds the address.
export async function findProfileByEmail(email: string): Promise<ProfileRecord | null> {
  const address = email.toLowerCase();
  let start: Record<string, unknown> | undefined;
  do {
    const res = await doc.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: "sk = :profile AND email = :email",
        ExpressionAttributeValues: { ":profile": PROFILE_SK, ":email": address },
        ExclusiveStartKey: start,
      }),
    );
    const found = res.Items?.[0];
    if (found) return getProfileRecord(String(found.userId));
    start = res.LastEvaluatedKey;
  } while (start);
  return null;
}
