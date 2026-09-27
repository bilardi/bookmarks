import { describe, expect, it } from "vitest";

import { callerOf, readBody, type ApiEvent } from "../src/http";

function event(overrides: Partial<ApiEvent>): ApiEvent {
  return {
    headers: {},
    requestContext: { authorizer: { jwt: { claims: { sub: "u1", name: "Ada", email: "Ada@Example.com" } } } },
    ...overrides,
  } as unknown as ApiEvent;
}

describe("callerOf", () => {
  it("reads the caller from the claims, with the email lowercased", () => {
    expect(callerOf(event({}))).toEqual({ userId: "u1", name: "Ada", email: "ada@example.com" });
  });
});

describe("readBody", () => {
  it("is undefined for a body that is not JSON, so the schema refuses it", () => {
    expect(readBody(event({ body: "{" }))).toBeUndefined();
    expect(readBody(event({ body: '{"a":1}' }))).toEqual({ a: 1 });
  });
});
