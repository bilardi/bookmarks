import { DeleteCommand } from "@aws-sdk/lib-dynamodb";

import { doc, queryAll, TABLE_NAME } from "../src/dynamo";
import { TAG_PREFIX, tagMemberPk, userPk } from "../src/keys";
import type { Caller } from "../src/http";

export function caller(userId: string, name = userId): Caller {
  return { userId, name, email: `${userId}@test` };
}

// Everything of a person is under their partition, except the members of their
// tags, which have partitions of their own: those go first, found through the tags.
export async function wipeUsers(userIds: string[]): Promise<void> {
  for (const userId of userIds) {
    const records = await queryAll({
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": userPk(userId) },
    });
    for (const record of records) {
      const sk = String(record.sk);
      if (sk.startsWith(TAG_PREFIX)) {
        const members = await queryAll({
          TableName: TABLE_NAME,
          KeyConditionExpression: "pk = :pk",
          ExpressionAttributeValues: { ":pk": tagMemberPk(userId, sk.slice(TAG_PREFIX.length)) },
        });
        for (const member of members) {
          await doc.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { pk: member.pk, sk: member.sk } }));
        }
      }
      await doc.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { pk: record.pk, sk: record.sk } }));
    }
  }
}
