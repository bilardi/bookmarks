import { describe, expect, it } from "vitest";

describe("core toolchain", () => {
  it("runs a trivial assertion", () => {
    expect(1 + 1).toBe(2);
  });
});
