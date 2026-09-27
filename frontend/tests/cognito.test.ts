import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  window.history.replaceState({}, "", "/");
});

describe("auth with Cognito", () => {
  it("shows a refusal and starts no login", async () => {
    vi.stubEnv("VITE_COGNITO_ISSUER", "https://cognito-idp.eu-west-1.amazonaws.com/pool");
    vi.stubEnv("VITE_COGNITO_CLIENT_ID", "client");
    window.history.replaceState(
      {},
      "",
      "/?error_description=PreSignUp+failed+with+error+not-invited.+&error=invalid_request",
    );
    const cognito = await import("../src/auth/cognito");

    await cognito.startSession();

    // A login would have needed the metadata of the issuer, which the test cannot
    // reach: startSession resolving at all says none was started.
    expect(cognito.refusal()).toBe("PreSignUp failed with error not-invited. ");
    expect(cognito.hasSession()).toBe(false);
    expect(window.location.search).toBe("");
  });
});
