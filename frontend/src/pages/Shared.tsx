import { useEffect, useState } from "react";

import type { OwnerView } from "@bookmarks/core";

import { listOwners, messageOf } from "../api";
import { Link } from "../components/Link";
import { bookmarksPath } from "../router";

// Who shares something: each name opens their bookmarks, read only.
export function Shared() {
  const [owners, setOwners] = useState<OwnerView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listOwners()
      .then(setOwners)
      .catch((e: unknown) => setError(messageOf(e)));
  }, []);

  if (error !== null) return <p role="alert">{error}</p>;
  if (owners === null) return <p>Loading ..</p>;
  if (owners.length === 0) return <p>Nobody shares anything yet.</p>;
  return (
    <ul className="owners">
      {[...owners]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((owner) => (
          <li key={owner.userId}>
            <Link to={bookmarksPath(owner.userId, "")}>{owner.name || owner.userId}</Link>
          </li>
        ))}
    </ul>
  );
}
