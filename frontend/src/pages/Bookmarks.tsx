import { useEffect, useState } from "react";

import { filterByTags } from "@bookmarks/core";
import type { FolderView, ItemView, TagView } from "@bookmarks/core";

import { filterItems, listFolders, listItems, listTags, messageOf } from "../api";
import { Breadcrumb } from "../components/Breadcrumb";
import { FolderList } from "../components/FolderList";
import { ItemRow } from "../components/ItemRow";
import { NewItem } from "../components/NewItem";
import { Link } from "../components/Link";
import { TagBar } from "../components/TagBar";
import { bookmarksPath } from "../router";

interface Props {
  owner?: string;
  ownerName: string;
  path: string;
  tags: string[];
}

interface Contents {
  folders: FolderView[];
  items: ItemView[];
  tags: TagView[];
}

// The arrows move an item past the visible neighbor of its own folder: with a tag
// filter the list mixes folders, and the edge of a folder is where they stop.
export function neighbors(items: ItemView[], index: number): { up?: string; down?: string } {
  const current = items[index];
  const up = items.slice(0, index).reverse().find((i) => i.path === current.path)?.id;
  const down = items.slice(index + 1).find((i) => i.path === current.path)?.id;
  return { up, down };
}

export function Bookmarks({ owner, ownerName, path, tags }: Props) {
  const own = owner === undefined;
  const filtered = tags.length > 0;
  const [contents, setContents] = useState<Contents | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const reload = (): void => setVersion((v) => v + 1);
  const tagKey = tags.join(",");

  useEffect(() => {
    let alive = true;
    const items = filtered ? filterItems(owner, tags) : listItems(owner, path);
    const folders = filtered ? Promise.resolve([]) : listFolders(owner, path);
    Promise.all([folders, items, listTags(owner)])
      .then(([f, i, t]) => {
        if (!alive) return;
        setContents({ folders: f, items: i, tags: t });
        setError(null);
      })
      .catch((e: unknown) => {
        if (alive) setError(messageOf(e));
      });
    return () => {
      alive = false;
    };
    // tags is compared by its text: a new array with the same tags is the same filter.
  }, [owner, path, tagKey, version]);

  if (error !== null) return <p role="alert">{error}</p>;
  if (contents === null) return <p>Loading ..</p>;

  const available = filtered ? filterByTags(contents.items, tags).available : contents.tags.map((t) => t.name);

  return (
    <section>
      <Breadcrumb owner={owner} ownerName={ownerName} path={path} />
      <TagBar owner={owner} path={path} selected={tags} available={available} />
      {filtered && (
        <p className="muted">
          {"Items with every selected tag. "}
          <Link to={bookmarksPath(owner, path)}>Back to the folder</Link>
        </p>
      )}
      {!filtered && <FolderList folders={contents.folders} owner={owner} own={own} onChange={reload} />}
      <ul className="items">
        {contents.items.map((item, index) => {
          const { up, down } = neighbors(contents.items, index);
          return (
            <ItemRow
              key={item.id}
              item={item}
              own={own}
              owner={owner}
              up={up}
              down={down}
              hiddenTags={tags}
              showPath={filtered}
              onChange={reload}
            />
          );
        })}
      </ul>
      {own && !filtered && <NewItem path={path} onChange={reload} />}
    </section>
  );
}
