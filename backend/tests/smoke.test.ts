import { describe, expect, it } from "vitest";

describe("backend toolchain", () => {
  it("runs a trivial assertion", () => {
    expect(1 + 1).toBe(2);
  });
});
