// The prices of S3 are never written in the code: they are read from the AWS
// Pricing API at every deploy and handed to the functions, together with the day
// they were read. Transfer is priced at the first tier and without the 100 GB the
// account gets free every month, so the estimate is an upper bound.
export interface S3Prices {
  referenceDate: string;
  getPer1000: number;
  putPer1000: number;
  transferOutPerGb: number;
  storagePerGbMonth: number;
}

const GB = 1024 ** 3;

export interface TrafficCounters {
  getCount: number;
  getBytes: number;
  putCount: number;
  putBytes: number;
}

export function trafficCost(c: TrafficCounters, prices: S3Prices): number {
  return (
    (c.getCount / 1000) * prices.getPer1000 +
    (c.putCount / 1000) * prices.putPer1000 +
    (c.getBytes / GB) * prices.transferOutPerGb
  );
}

export function storageCost(bytes: number, prices: S3Prices): number {
  return (bytes / GB) * prices.storagePerGbMonth;
}
