export type FileStatus = "pending" | "ready";

// The object behind a file item. The key never changes, whatever folder the item
// moves to: S3 has no rename.
export interface StoredFile {
  key: string;
  name: string;
  size: number;
  contentType: string;
  status: FileStatus;
}

export interface Item {
  id: string;
  owner: string;
  title: string;
  text?: string;
  link?: string;
  file?: StoredFile;
  path: string;
  position: number;
  tags: string[];
  shared: boolean;
  // For everybody, without a login: only the curator publishes, only links, and a
  // published item is also shared. Absent on the items written before it existed.
  published?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ItemKind = "link" | "file" | "note";

// An item with neither a link nor a file is a note.
export function kindOf(item: Pick<Item, "link" | "file">): ItemKind {
  if (item.link) return "link";
  if (item.file) return "file";
  return "note";
}
