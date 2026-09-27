import { ancestors } from "@bookmarks/core";

import { folderSk, tagSk } from "./keys";

export interface CounterDelta {
  items: number;
  shared: number;
}

// What an item weighs on the counters: one for every folder above it, the root
// included, and one for every tag it carries.
export interface Footprint {
  path: string;
  tags: string[];
  shared: boolean;
}

function footprint(f: Footprint | undefined): Map<string, CounterDelta> {
  const map = new Map<string, CounterDelta>();
  if (!f) return map;
  const shared = f.shared ? 1 : 0;
  for (const path of ancestors(f.path)) map.set(folderSk(path), { items: 1, shared });
  for (const tag of f.tags) map.set(tagSk(tag), { items: 1, shared });
  return map;
}

// After minus before, keyed by the sort key of the counter record. A key that does
// not move is left out, because one transaction cannot touch the same record twice.
export function counterDeltas(before?: Footprint, after?: Footprint): Map<string, CounterDelta> {
  const b = footprint(before);
  const a = footprint(after);
  const deltas = new Map<string, CounterDelta>();
  for (const key of new Set([...b.keys(), ...a.keys()])) {
    const items = (a.get(key)?.items ?? 0) - (b.get(key)?.items ?? 0);
    const shared = (a.get(key)?.shared ?? 0) - (b.get(key)?.shared ?? 0);
    if (items !== 0 || shared !== 0) deltas.set(key, { items, shared });
  }
  return deltas;
}

export function sharedDelta(before?: Footprint, after?: Footprint): number {
  return (after?.shared ? 1 : 0) - (before?.shared ? 1 : 0);
}
