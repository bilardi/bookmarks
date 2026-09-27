import { describe, expect, it } from "vitest";

import { pricesFromEnv } from "../src/prices";

const ENV = {
  S3_PRICES_DATE: "2026-09-27",
  S3_PRICE_GET_PER_1000: "0.0004",
  S3_PRICE_PUT_PER_1000: "0.005",
  S3_PRICE_TRANSFER_OUT_PER_GB: "0.09",
  S3_PRICE_STORAGE_PER_GB_MONTH: "0.023",
};

describe("pricesFromEnv", () => {
  it("reads the prices and the day they were read", () => {
    expect(pricesFromEnv(ENV)).toEqual({
      referenceDate: "2026-09-27",
      getPer1000: 0.0004,
      putPer1000: 0.005,
      transferOutPerGb: 0.09,
      storagePerGbMonth: 0.023,
    });
  });

  it("gives no prices at all when one is missing, zero or not a number", () => {
    expect(pricesFromEnv({ ...ENV, S3_PRICE_GET_PER_1000: undefined })).toBeNull();
    expect(pricesFromEnv({ ...ENV, S3_PRICE_PUT_PER_1000: "0" })).toBeNull();
    expect(pricesFromEnv({ ...ENV, S3_PRICE_TRANSFER_OUT_PER_GB: "free" })).toBeNull();
    expect(pricesFromEnv({ ...ENV, S3_PRICES_DATE: "" })).toBeNull();
  });
});
