import { storageCost, trafficCost } from "@bookmarks/core";
import type { MeView, OwnerView, S3Prices, UsageView } from "@bookmarks/core";

import { getProfileRecord, listOwners, registerProfile } from "../repository/profiles";
import { listUsage } from "../repository/usage";
import type { Caller } from "../http";

// The curator is whoever deployed, named by email: nothing in the pages can make
// somebody else one.
export async function getMe(caller: Caller, curatorEmail: string): Promise<MeView> {
  await registerProfile(caller);
  const curator = curatorEmail !== "" && caller.email === curatorEmail.toLowerCase();
  return { userId: caller.userId, name: caller.name, email: caller.email, curator };
}

// Bytes always, costs only when the deploy configured the prices.
export async function getUsage(caller: Caller, prices: S3Prices | null): Promise<UsageView> {
  const months = await listUsage(caller.userId);
  const { storedBytes } = await getProfileRecord(caller.userId);
  if (!prices) return { months, storedBytes };
  return {
    months: months.map((month) => ({ ...month, cost: trafficCost(month, prices) })),
    storedBytes,
    storageCost: storageCost(storedBytes, prices),
    pricesDate: prices.referenceDate,
  };
}

// The owners to browse under Shared: everybody who shares something, except oneself.
export async function listOwnersFor(caller: Caller): Promise<OwnerView[]> {
  return (await listOwners()).filter((owner) => owner.userId !== caller.userId);
}
