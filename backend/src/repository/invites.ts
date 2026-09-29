import { DeleteCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

import { doc, TABLE_NAME } from "../dynamo";
import { INVITE_SK, invitePk } from "../keys";

export async function isInvited(email: string): Promise<boolean> {
  const res = await doc.send(new GetCommand({ TableName: TABLE_NAME, Key: { pk: invitePk(email), sk: INVITE_SK } }));
  return res.Item !== undefined;
}

// The address is kept beside the key, so a listing of the table says who it is.
export async function addInvite(email: string): Promise<void> {
  const address = email.toLowerCase();
  await doc.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: { pk: invitePk(address), sk: INVITE_SK, email: address, invitedAt: new Date().toISOString() },
    }),
  );
}

// True when there was an invitation to take back.
export async function removeInvite(email: string): Promise<boolean> {
  const res = await doc.send(
    new DeleteCommand({ TableName: TABLE_NAME, Key: { pk: invitePk(email), sk: INVITE_SK }, ReturnValues: "ALL_OLD" }),
  );
  return res.Attributes !== undefined;
}
