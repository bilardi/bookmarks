import { ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

import type { TrafficCounters } from "@bookmarks/core";

import { doc, queryAll, TABLE_NAME } from "../dynamo";
import { PROFILE_SK, USAGE_PREFIX, usageSk, userPk } from "../keys";

export type UsageDelta = Partial<TrafficCounters>;

export interface UsageRecord extends TrafficCounters {
  month: string;
}

export function currentMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export async function addUsage(sub: string, month: string, delta: UsageDelta): Promise<void> {
  const entries = Object.entries(delta).filter(([, value]) => value !== undefined && value !== 0);
  if (entries.length === 0) return;
  await doc.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: userPk(sub), sk: usageSk(month) },
      UpdateExpression: `SET #month = :month ADD ${entries.map(([name]) => `${name} :${name}`).join(", ")}`,
      ExpressionAttributeNames: { "#month": "month" },
      ExpressionAttributeValues: {
        ":month": month,
        ...Object.fromEntries(entries.map(([name, value]) => [`:${name}`, value])),
      },
    }),
  );
}

// The most recent month first.
export async function listUsage(sub: string): Promise<UsageRecord[]> {
  const records = await queryAll({
    TableName: TABLE_NAME,
    KeyConditionExpression: "pk = :pk AND begins_with(sk, :usage)",
    ExpressionAttributeValues: { ":pk": userPk(sub), ":usage": USAGE_PREFIX },
    ScanIndexForward: false,
  });
  return records.map(usageFrom);
}

function usageFrom(r: Record<string, unknown>): UsageRecord {
  return {
    month: String(r.month),
    getCount: Number(r.getCount ?? 0),
    getBytes: Number(r.getBytes ?? 0),
    putCount: Number(r.putCount ?? 0),
    putBytes: Number(r.putBytes ?? 0),
  };
}

export interface PersonUsage {
  userId: string;
  name: string;
  email: string;
  storedBytes: number;
  months: UsageRecord[];
}

// For the curator only, from the command line: a scan reads the whole table, which
// for a few invited people is a handful of pages and a fraction of a cent. The
// pages never call it.
export async function listEveryUsage(): Promise<PersonUsage[]> {
  const people = new Map<string, PersonUsage>();
  const person = (pk: string): PersonUsage => {
    const userId = pk.slice(userPk("").length);
    let found = people.get(userId);
    if (!found) {
      found = { userId, name: "", email: "", storedBytes: 0, months: [] };
      people.set(userId, found);
    }
    return found;
  };
  let start: Record<string, unknown> | undefined;
  do {
    const res = await doc.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: "sk = :profile OR begins_with(sk, :usage)",
        ExpressionAttributeValues: { ":profile": PROFILE_SK, ":usage": USAGE_PREFIX },
        ExclusiveStartKey: start,
      }),
    );
    for (const r of res.Items ?? []) {
      const p = person(String(r.pk));
      if (r.sk === PROFILE_SK) {
        p.name = String(r.name ?? "");
        p.email = String(r.email ?? "");
        p.storedBytes = Number(r.storedBytes ?? 0);
      } else {
        p.months.push(usageFrom(r));
      }
    }
    start = res.LastEvaluatedKey;
  } while (start);
  for (const p of people.values()) p.months.sort((a, b) => (a.month < b.month ? 1 : -1));
  return [...people.values()];
}
