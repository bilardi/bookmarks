import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DeleteCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { PreSignUpTriggerEvent } from "aws-lambda";

import { makePreSignUp } from "../src/handlers/preSignUp";
import { doc, TABLE_NAME } from "../src/dynamo";
import { INVITE_SK, invitePk } from "../src/keys";

const INVITED = "invited@test";
const preSignUp = makePreSignUp("Curator@Test");

function event(email: string | undefined): PreSignUpTriggerEvent {
  return {
    triggerSource: "PreSignUp_ExternalProvider",
    request: { userAttributes: email === undefined ? {} : { email } },
    response: { autoConfirmUser: false, autoVerifyEmail: false, autoVerifyPhone: false },
  } as unknown as PreSignUpTriggerEvent;
}

beforeEach(async () => {
  await doc.send(new PutCommand({ TableName: TABLE_NAME, Item: { pk: invitePk(INVITED), sk: INVITE_SK } }));
});

afterEach(async () => {
  await doc.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { pk: invitePk(INVITED), sk: INVITE_SK } }));
});

describe("preSignUp", () => {
  it("lets in an invited address, whatever its case", async () => {
    const e = event("Invited@Test");
    expect(await preSignUp(e)).toBe(e);
  });

  it("lets in the curator without an invitation", async () => {
    const e = event("curator@test");
    expect(await preSignUp(e)).toBe(e);
  });

  it("refuses an address that is not invited, and one that is missing", async () => {
    await expect(preSignUp(event("stranger@test"))).rejects.toThrow("not-invited");
    await expect(preSignUp(event(undefined))).rejects.toThrow("not-invited");
  });

  it("refuses everybody but the invited when no curator is configured", async () => {
    await expect(makePreSignUp("")(event(""))).rejects.toThrow("not-invited");
  });
});
