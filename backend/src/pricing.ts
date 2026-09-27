interface PriceDimension {
  beginRange: string;
  pricePerUnit: { USD?: string };
}

interface Product {
  terms: { OnDemand?: Record<string, { priceDimensions: Record<string, PriceDimension> }> };
}

// Exactly one product and a positive price in its first tier, or an error that
// names the price: a usage type renamed by AWS must stop the deploy, never turn
// into a cost of zero.
export function firstTierPrice(priceList: string[], what: string): number {
  if (priceList.length !== 1) throw new Error(`${what}: expected one product, found ${priceList.length}`);
  const product = JSON.parse(priceList[0]) as Product;
  const dimensions = Object.values(product.terms.OnDemand ?? {}).flatMap((term) => Object.values(term.priceDimensions));
  const first = dimensions.find((d) => d.beginRange === "0");
  const price = Number(first?.pricePerUnit.USD);
  if (!first || !Number.isFinite(price) || price <= 0) throw new Error(`${what}: no positive price in the first tier`);
  return price;
}

// Twelve significant digits are more than any price carries, and drop the noise
// of a multiplication in floating point.
export function scaledPrice(unit: number, perUnit: number): number {
  return Number((unit * perUnit).toPrecision(12));
}

export interface PriceQuery {
  name: string;
  serviceCode: string;
  filters: Record<string, string>;
  perUnit: number;
}

// The usage types carry a prefix of the region, and it is not derived from the
// code of the region: a region is added here once its prefix has been read.
const USAGE_PREFIX: Record<string, string> = { "eu-west-1": "EU" };

// The files live in Intelligent-Tiering, so its requests and its frequent tier are
// the prices asked for. The transfer to the internet is priced in the
// AWSDataTransfer offer: rows with the same usage type in the S3 offer are other
// prices.
export function priceQueries(region: string): PriceQuery[] {
  const prefix = USAGE_PREFIX[region];
  if (!prefix) throw new Error(`no usage type prefix known for ${region}`);
  const s3 = (usagetype: string) => ({ regionCode: region, usagetype });
  return [
    { name: "S3PriceGetPer1000", serviceCode: "AmazonS3", filters: s3(`${prefix}-Requests-INT-Tier2`), perUnit: 1000 },
    { name: "S3PricePutPer1000", serviceCode: "AmazonS3", filters: s3(`${prefix}-Requests-INT-Tier1`), perUnit: 1000 },
    { name: "S3PriceStoragePerGbMonth", serviceCode: "AmazonS3", filters: s3(`${prefix}-TimedStorage-INT-FA-ByteHrs`), perUnit: 1 },
    {
      name: "S3PriceTransferOutPerGb",
      serviceCode: "AWSDataTransfer",
      filters: {
        fromRegionCode: region,
        usagetype: `${prefix}-DataTransfer-Out-Bytes`,
        toLocation: "External",
        transferType: "AWS Outbound",
      },
      perUnit: 1,
    },
  ];
}
