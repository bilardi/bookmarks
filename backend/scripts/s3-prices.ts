// Reads the S3 prices from the AWS Pricing API and prints them as the parameters of
// the deploy, with the day they were read. Any price not found ends the script
// with an error, and the deploy with it. Usage: npx tsx scripts/s3-prices.ts <region>
import { GetProductsCommand, PricingClient } from "@aws-sdk/client-pricing";

import { firstTierPrice, priceQueries, scaledPrice } from "../src/pricing";

const region = process.argv[2] ?? "eu-west-1";
// The Pricing API answers from a few regions only, us-east-1 among them.
const client = new PricingClient({ region: "us-east-1" });

const params = [`S3PricesDate=${new Date().toISOString().slice(0, 10)}`];
for (const query of priceQueries(region)) {
  const res = await client.send(
    new GetProductsCommand({
      ServiceCode: query.serviceCode,
      Filters: Object.entries(query.filters).map(([Field, Value]) => ({ Type: "TERM_MATCH" as const, Field, Value })),
      MaxResults: 10,
    }),
  );
  params.push(`${query.name}=${scaledPrice(firstTierPrice(res.PriceList ?? [], query.name), query.perUnit)}`);
}
console.log(params.join(" "));
