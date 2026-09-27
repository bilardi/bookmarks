import { describe, expect, it } from "vitest";

import { formatBytes, formatUsd } from "../src/format";

describe("formatBytes", () => {
  it("picks the unit that keeps the number short", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 ** 3)).toBe("5.0 GB");
  });
});

describe("formatUsd", () => {
  it("keeps four decimals, because the costs of one person are small", () => {
    expect(formatUsd(0.0954)).toBe("$0.0954");
    expect(formatUsd(0)).toBe("$0.0000");
  });
});
