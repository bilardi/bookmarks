import { GetProductsCommand, PricingClient } from "@aws-sdk/client-pricing";

import type { S3Prices } from "@bookmarks/core";

import { firstTierPrice, priceQueries, scaledPrice } from "../src/pricing";

// The name of each parameter of the deploy, and the field of S3Prices it fills.
const FIELDS: Record<string, keyof Omit<S3Prices, "referenceDate">> = {
  S3PriceGetPer1000: "getPer1000",
  S3PricePutPer1000: "putPer1000",
  S3PriceTransferOutPerGb: "transferOutPerGb",
  S3PriceStoragePerGbMonth: "storagePerGbMonth",
};

// The prices of today, both as the parameters of the deploy and as the prices the
// costs are computed with. Any price not found throws, and whoever called stops.
export async function readPrices(region: string): Promise<{ params: string[]; prices: S3Prices }> {
  // The Pricing API answers from a few regions only, us-east-1 among them.
  const client = new PricingClient({ region: "us-east-1" });
  const referenceDate = new Date().toISOString().slice(0, 10);
  const params = [`S3PricesDate=${referenceDate}`];
  const prices = { referenceDate } as S3Prices;
  for (const query of priceQueries(region)) {
    const res = await client.send(
      new GetProductsCommand({
        ServiceCode: query.serviceCode,
        Filters: Object.entries(query.filters).map(([Field, Value]) => ({ Type: "TERM_MATCH" as const, Field, Value })),
        MaxResults: 10,
      }),
    );
    const value = scaledPrice(firstTierPrice(res.PriceList ?? [], query.name), query.perUnit);
    params.push(`${query.name}=${value}`);
    prices[FIELDS[query.name]] = value;
  }
  return { params, prices };
}
