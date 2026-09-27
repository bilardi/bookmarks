import { GetCommand } from "@aws-sdk/lib-dynamodb";

import { doc, TABLE_NAME } from "../dynamo";
import { INVITE_SK, invitePk } from "../keys";

export async function isInvited(email: string): Promise<boolean> {
  const res = await doc.send(new GetCommand({ TableName: TABLE_NAME, Key: { pk: invitePk(email), sk: INVITE_SK } }));
  return res.Item !== undefined;
}
