import { queryAll, TABLE_NAME } from "../dynamo";
import { TAG_PREFIX, tagMemberPk, userPk } from "../keys";

export interface TagRecord {
  name: string;
  itemCount: number;
  sharedCount: number;
}

export async function listTagRecords(owner: string): Promise<TagRecord[]> {
  const records = await queryAll({
    TableName: TABLE_NAME,
    KeyConditionExpression: "pk = :pk AND begins_with(sk, :tag)",
    ExpressionAttributeValues: { ":pk": userPk(owner), ":tag": TAG_PREFIX },
  });
  return records.map((r) => ({
    name: String(r.name),
    itemCount: Number(r.itemCount ?? 0),
    sharedCount: Number(r.sharedCount ?? 0),
  }));
}

export async function tagMembers(owner: string, name: string): Promise<string[]> {
  const records = await queryAll({
    TableName: TABLE_NAME,
    KeyConditionExpression: "pk = :pk",
    ExpressionAttributeValues: { ":pk": tagMemberPk(owner, name) },
  });
  return records.map((r) => String(r.sk).slice("ITEM#".length));
}
