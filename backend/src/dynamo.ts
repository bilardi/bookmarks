import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchGetCommand, DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { QueryCommandInput } from "@aws-sdk/lib-dynamodb";

export const TABLE_NAME = process.env.TABLE_NAME ?? "bookmarks";

function makeClient(): DynamoDBDocumentClient {
  const endpoint = process.env.DYNAMODB_ENDPOINT_URL;
  const base = new DynamoDBClient(endpoint ? { endpoint } : {});
  return DynamoDBDocumentClient.from(base, {
    marshallOptions: { removeUndefinedValues: true },
  });
}

export const doc = makeClient();

// Every page of a query: a folder or a tag can hold more than one page of items.
export async function queryAll(input: QueryCommandInput): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const res = await doc.send(new QueryCommand({ ...input, ExclusiveStartKey: start }));
    items.push(...(res.Items ?? []));
    start = res.LastEvaluatedKey;
  } while (start);
  return items;
}

type Key = { pk: string; sk: string };

// BatchGet reads at most 100 keys, and may hand some back unprocessed.
export async function batchGet(keys: Key[]): Promise<Record<string, unknown>[]> {
  const found: Record<string, unknown>[] = [];
  for (let i = 0; i < keys.length; i += 100) {
    let pending: Key[] = keys.slice(i, i + 100);
    while (pending.length > 0) {
      const res = await doc.send(new BatchGetCommand({ RequestItems: { [TABLE_NAME]: { Keys: pending } } }));
      found.push(...(res.Responses?.[TABLE_NAME] ?? []));
      pending = (res.UnprocessedKeys?.[TABLE_NAME]?.Keys ?? []) as Key[];
    }
  }
  return found;
}
