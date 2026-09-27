import type { FolderView } from "@bookmarks/core";

import { deleteFolder, renameFolder, shareFolder } from "../api";
import { bookmarksPath } from "../router";
import { ActionButton } from "./ActionButton";
import { Link } from "./Link";

interface Props {
  folders: FolderView[];
  owner?: string;
  own: boolean;
  onChange: () => void;
}

function FolderRow({ folder, owner, own, onChange }: { folder: FolderView } & Omit<Props, "folders">) {
  const cut = folder.path.lastIndexOf("/");
  const name = folder.path.slice(cut + 1);
  const parent = cut === -1 ? "" : folder.path.slice(0, cut);
  const allShared = folder.itemCount > 0 && folder.sharedCount === folder.itemCount;
  return (
    <li className="row folder">
      <Link to={bookmarksPath(owner, folder.path)}>{`${name}/`}</Link>
      <span className="count">{folder.itemCount}</span>
      {own && (
        <>
          <ActionButton
            label="Rename"
            onAction={async () => {
              const next = window.prompt("New name of the folder", name);
              if (next === null || next === name) return;
              await renameFolder(folder.path, parent === "" ? next : `${parent}/${next}`);
              onChange();
            }}
          />
          <ActionButton
            label={allShared ? "Unshare folder" : "Share folder"}
            onAction={async () => {
              await shareFolder(folder.path, !allShared);
              onChange();
            }}
          />
          <ActionButton
            label="Delete"
            onAction={async () => {
              if (!window.confirm(`Delete the folder "${name}"? Only an empty folder can go.`)) return;
              await deleteFolder(folder.path);
              onChange();
            }}
          />
        </>
      )}
    </li>
  );
}

export function FolderList({ folders, owner, own, onChange }: Props) {
  if (folders.length === 0) return null;
  return (
    <ul className="folders">
      {folders.map((folder) => (
        <FolderRow key={folder.path} folder={folder} owner={owner} own={own} onChange={onChange} />
      ))}
    </ul>
  );
}
