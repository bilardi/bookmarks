import { UpdateCommand } from "@aws-sdk/lib-dynamodb";

import type { TrafficCounters } from "@bookmarks/core";

import { doc, queryAll, TABLE_NAME } from "../dynamo";
import { USAGE_PREFIX, usageSk, userPk } from "../keys";

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
  return records.map((r) => ({
    month: String(r.month),
    getCount: Number(r.getCount ?? 0),
    getBytes: Number(r.getBytes ?? 0),
    putCount: Number(r.putCount ?? 0),
    putBytes: Number(r.putBytes ?? 0),
  }));
}
