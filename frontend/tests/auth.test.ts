import { describe, expect, it } from "vitest";

import { authHeaders, currentUser, hasSession, isCognito, refusal } from "../src/auth";

describe("auth in development", () => {
  it("picks the development implementation when no build asks for Cognito", () => {
    expect(isCognito).toBe(false);
  });

  it("always has a session and never a refusal, because there is nothing to log into", () => {
    expect(hasSession()).toBe(true);
    expect(refusal()).toBeNull();
  });

  it("gives a fixed person and the headers the backend accepts only locally", () => {
    expect(currentUser()).toEqual({ userId: "u1", name: "Ada Lovelace" });
    expect(authHeaders()).toEqual({ "x-dev-user": "u1", "x-dev-name": "Ada Lovelace" });
  });
});
