import type { S3Prices } from "@bookmarks/core";

// The prices arrive as variables of the function, read from the AWS Pricing API by
// the deploy. One of them missing, zero or not a number means no prices at all: a
// cost shown as zero would be wrong, while an empty one is only missing.
const NAMES = {
  getPer1000: "S3_PRICE_GET_PER_1000",
  putPer1000: "S3_PRICE_PUT_PER_1000",
  transferOutPerGb: "S3_PRICE_TRANSFER_OUT_PER_GB",
  storagePerGbMonth: "S3_PRICE_STORAGE_PER_GB_MONTH",
} as const;

export function pricesFromEnv(env: Record<string, string | undefined>): S3Prices | null {
  const referenceDate = env.S3_PRICES_DATE;
  if (!referenceDate) return null;
  const prices: Record<string, unknown> = { referenceDate };
  for (const [field, name] of Object.entries(NAMES)) {
    const value = Number(env[name]);
    if (!Number.isFinite(value) || value <= 0) return null;
    prices[field] = value;
  }
  return prices as unknown as S3Prices;
}
