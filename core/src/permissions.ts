interface Owned {
  owner: string;
  shared: boolean;
}

export function canRead(item: Owned, userId: string): boolean {
  return item.owner === userId || item.shared;
}

// Sharing gives reading only: the personal view is the one thing others write.
export function canWrite(item: Pick<Owned, "owner">, userId: string): boolean {
  return item.owner === userId;
}
