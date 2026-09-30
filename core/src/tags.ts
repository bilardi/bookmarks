import { normalizeName } from "./names";

export function normalizeTag(raw: string): string | null {
  return normalizeName(raw);
}

export interface TagFilterResult<T> {
  items: T[];
  available: string[];
}

// The items with every selected tag, and the tags still worth offering: those that
// appear on at least one of them. Selecting "lessons" offers "english" and
// "spanish", not every lesson of both courses.
export function filterByTags<T extends { tags: string[] }>(
  items: T[],
  selected: string[],
): TagFilterResult<T> {
  const matching = items.filter((item) => selected.every((tag) => item.tags.includes(tag)));
  const available = new Set<string>();
  for (const item of matching) {
    for (const tag of item.tags) if (!selected.includes(tag)) available.add(tag);
  }
  return { items: matching, available: [...available].sort() };
}

// How many other tags appear together with each tag, over the items given:
// bookmarks-v3.0 ordered and colored its tags by this, not by how many items carry them.
export function tagConnections(items: { tags: string[] }[]): Map<string, number> {
  const together = new Map<string, Set<string>>();
  for (const item of items) {
    for (const tag of item.tags) {
      const seen = together.get(tag) ?? new Set<string>();
      for (const other of item.tags) if (other !== tag) seen.add(other);
      together.set(tag, seen);
    }
  }
  return new Map([...together].map(([tag, seen]) => [tag, seen.size]));
}

export const TAG_TONES = 5;

// The tones of bookmarks-v3.0: 0 for a tag alone, then one tone for each other tag
// it appears with, up to 5 for five or more.
export function tagTone(connections: number): number {
  return Math.min(Math.max(connections, 0), TAG_TONES);
}

// The most connected first, and by name among equals.
export function byConnections(tags: string[], connections: Map<string, number>): string[] {
  return [...tags].sort((a, b) => (connections.get(b) ?? 0) - (connections.get(a) ?? 0) || a.localeCompare(b));
}
