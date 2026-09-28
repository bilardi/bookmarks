import { useEffect, useState } from "react";

import type { UsageView } from "@bookmarks/core";

import { getUsage, messageOf } from "../api";
import { formatBytes, formatUsd } from "../format";

// What one person makes S3 do, month by month: the curator sees everybody with
// make usage, each person sees their own here.
export function Usage() {
  const [usage, setUsage] = useState<UsageView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getUsage()
      .then(setUsage)
      .catch((e: unknown) => setError(messageOf(e)));
  }, []);

  if (error !== null) return <p role="alert">{error}</p>;
  if (usage === null) return <p>Loading ..</p>;
  return (
    <section>
      <table>
        <thead>
          <tr>
            <th>Month</th>
            <th className="num">GET</th>
            <th className="num">GET bytes</th>
            <th className="num">PUT</th>
            <th className="num">PUT bytes</th>
            <th className="num">Cost</th>
          </tr>
        </thead>
        <tbody>
          {usage.months.map((m) => (
            <tr key={m.month}>
              <td>{m.month}</td>
              <td className="num">{m.getCount}</td>
              <td className="num">{formatBytes(m.getBytes)}</td>
              <td className="num">{m.putCount}</td>
              <td className="num">{formatBytes(m.putBytes)}</td>
              <td className="num">{m.cost === undefined ? "" : formatUsd(m.cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        {`Stored: ${formatBytes(usage.storedBytes)}`}
        {usage.storageCost !== undefined && `, ${formatUsd(usage.storageCost)} a month`}
      </p>
      <p className="muted">
        {usage.pricesDate !== undefined
          ? `Prices of S3 read on ${usage.pricesDate}: an upper bound, without the free tier.`
          : "The costs appear once the deploy has read the prices."}
      </p>
    </section>
  );
}
