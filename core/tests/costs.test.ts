import { describe, expect, it } from "vitest";

import { storageCost, trafficCost, type S3Prices } from "../src/costs";

const GB = 1024 ** 3;

// Round numbers, so the expected values read at a glance.
const PRICES: S3Prices = {
  referenceDate: "2026-09-27",
  getPer1000: 0.001,
  putPer1000: 0.01,
  transferOutPerGb: 0.1,
  storagePerGbMonth: 0.02,
};

describe("trafficCost", () => {
  it("adds requests and transfer", () => {
    // 1,000 GET, 1,000 PUT and 1 GB downloaded.
    expect(trafficCost({ getCount: 1000, getBytes: GB, putCount: 1000, putBytes: GB }, PRICES)).toBeCloseTo(
      0.001 + 0.01 + 0.1,
      6,
    );
  });

  it("is zero with no traffic", () => {
    expect(trafficCost({ getCount: 0, getBytes: 0, putCount: 0, putBytes: 0 }, PRICES)).toBe(0);
  });
});

describe("storageCost", () => {
  it("is the monthly price of the bytes stored", () => {
    expect(storageCost(GB, PRICES)).toBeCloseTo(0.02, 6);
  });
});
