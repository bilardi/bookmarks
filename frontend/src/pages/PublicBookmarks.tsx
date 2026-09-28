import { useEffect, useState } from "react";

import { filterByTags, tagConnections } from "@bookmarks/core";
import type { PublicItemView } from "@bookmarks/core";

import { listPublic, messageOf } from "../api";
import { isCognito, login } from "../auth";
import { TagBar } from "../components/TagBar";
import { navigate, PATHS, publicPath } from "../router";

// The page for everybody, without a login: the links the curator published, and
// the tags to narrow them, as bookmarks-v3.0 did.
export function PublicBookmarks({ tags }: { tags: string[] }) {
  const [items, setItems] = useState<PublicItemView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listPublic()
      .then(setItems)
      .catch((e: unknown) => setError(messageOf(e)));
  }, []);

  const connections = tagConnections(items ?? []);
  const { items: shown, available } = filterByTags(items ?? [], tags);

  return (
    <>
      <header className="app">
        <strong>Bookmarks</strong>
        <span className="right">
          <button type="button" onClick={() => (isCognito ? login() : navigate(PATHS.mine))}>
            Log in
          </button>
        </span>
      </header>
      <main>
        {error !== null && <p role="alert">{error}</p>}
        {error === null && items === null && <p>Loading ..</p>}
        {items !== null && (
          <>
            <TagBar selected={tags} available={available} connections={connections} pathOf={publicPath} />
            <ul className="items">
              {shown.map((item) => (
                <li key={item.id} className="row">
                  <a className="title" href={item.link} target="_blank" rel="noopener noreferrer">
                    {item.title}
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </>
  );
}
