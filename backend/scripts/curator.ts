// The commands of the curator, run from the Makefile with the AWS profile of the
// curator and the table of the stack. Usage: npx tsx scripts/curator.ts invite <email>
//                                            npx tsx scripts/curator.ts ban <email>
//                                            npx tsx scripts/curator.ts usage <region>
import { storageCost, trafficCost } from "@bookmarks/core";

import { addInvite, removeInvite } from "../src/repository/invites";
import { listEveryUsage } from "../src/repository/usage";
import { readPrices } from "./read-prices";

const MB = 1024 ** 2;
const [command, arg] = process.argv.slice(2);

function money(value: number): string {
  return `$${value.toFixed(4)}`;
}

if (command === "invite" && arg) {
  await addInvite(arg);
  console.log(`invited ${arg.toLowerCase()}`);
} else if (command === "ban" && arg) {
  const taken = await removeInvite(arg);
  console.log(taken ? `invitation of ${arg.toLowerCase()} taken back` : `no invitation for ${arg.toLowerCase()}`);
} else if (command === "usage") {
  const { prices } = await readPrices(arg ?? "eu-west-1");
  const rows = (await listEveryUsage()).flatMap((p) => {
    const person = p.email || p.name || p.userId;
    return [
      { person, month: "stored", mb: (p.storedBytes / MB).toFixed(1), cost: money(storageCost(p.storedBytes, prices)) },
      ...p.months.map((m) => ({
        person,
        month: m.month,
        get: m.getCount,
        "get mb": (m.getBytes / MB).toFixed(1),
        put: m.putCount,
        "put mb": (m.putBytes / MB).toFixed(1),
        cost: money(trafficCost(m, prices)),
      })),
    ];
  });
  console.table(rows);
  console.log(`prices of ${prices.referenceDate}, the storage per month`);
} else {
  console.error("usage: curator.ts invite <email> | ban <email> | usage <region>");
  process.exit(1);
}
