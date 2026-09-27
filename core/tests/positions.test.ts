import { describe, expect, it } from "vitest";

import { between, nextPosition, tooClose } from "../src/positions";

describe("nextPosition", () => {
  it("starts at 1 in an empty folder", () => {
    expect(nextPosition(undefined)).toBe(1);
  });

  it("goes to the next integer after the last", () => {
    expect(nextPosition(3)).toBe(4);
    expect(nextPosition(2.5)).toBe(3);
  });
});

describe("between", () => {
  it("is the midpoint of two positions", () => {
    expect(between(2, 3)).toBe(2.5);
  });

  it("goes before the first and after the last", () => {
    expect(between(undefined, 1)).toBe(0);
    expect(between(5, undefined)).toBe(6);
    expect(between(undefined, undefined)).toBe(1);
  });
});

describe("tooClose", () => {
  it("tells when two positions leave no room", () => {
    expect(tooClose(1, 1 + 1e-7)).toBe(true);
    expect(tooClose(1, 1.5)).toBe(false);
  });
});
