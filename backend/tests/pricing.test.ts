import { describe, expect, it } from "vitest";

import { firstTierPrice, priceQueries, scaledPrice } from "../src/pricing";

// The shape GetProducts answers with: one JSON string per product, with the terms
// inside. The numbers are the ones of the AmazonS3 offer of eu-west-1.
function product(dimensions: { beginRange: string; usd: string }[]): string {
  const priceDimensions = Object.fromEntries(
    dimensions.map((d, i) => [
      `dim${i}`,
      { beginRange: d.beginRange, endRange: "Inf", unit: "GB-Mo", pricePerUnit: { USD: d.usd } },
    ]),
  );
  return JSON.stringify({
    product: { attributes: { usagetype: "EU-TimedStorage-INT-FA-ByteHrs" } },
    terms: { OnDemand: { term1: { priceDimensions } } },
  });
}

describe("firstTierPrice", () => {
  it("takes the price of the tier that starts at zero", () => {
    const list = [product([{ beginRange: "51200", usd: "0.022" }, { beginRange: "0", usd: "0.023" }])];
    expect(firstTierPrice(list, "storage")).toBe(0.023);
  });

  it("refuses no product and more than one, naming what is missing", () => {
    expect(() => firstTierPrice([], "storage")).toThrow("storage: expected one product, found 0");
    const one = product([{ beginRange: "0", usd: "0.023" }]);
    expect(() => firstTierPrice([one, one], "storage")).toThrow("found 2");
  });

  it("refuses a price of zero or missing", () => {
    expect(() => firstTierPrice([product([{ beginRange: "0", usd: "0" }])], "get")).toThrow("get: no positive price");
    expect(() => firstTierPrice([product([{ beginRange: "10", usd: "1" }])], "get")).toThrow("get: no positive price");
  });
});

describe("scaledPrice", () => {
  it("turns a price per request into a price per 1,000 without floating noise", () => {
    expect(scaledPrice(0.0000004, 1000)).toBe(0.0004);
    expect(scaledPrice(0.000005, 1000)).toBe(0.005);
  });
});

describe("priceQueries", () => {
  it("asks for the four prices of eu-west-1", () => {
    expect(priceQueries("eu-west-1").map((q) => [q.name, q.serviceCode, q.filters.usagetype])).toEqual([
      ["S3PriceGetPer1000", "AmazonS3", "EU-Requests-INT-Tier2"],
      ["S3PricePutPer1000", "AmazonS3", "EU-Requests-INT-Tier1"],
      ["S3PriceStoragePerGbMonth", "AmazonS3", "EU-TimedStorage-INT-FA-ByteHrs"],
      ["S3PriceTransferOutPerGb", "AWSDataTransfer", "EU-DataTransfer-Out-Bytes"],
    ]);
  });

  it("refuses a region whose usage types it does not know", () => {
    expect(() => priceQueries("eu-south-1")).toThrow("no usage type prefix known for eu-south-1");
  });
});
