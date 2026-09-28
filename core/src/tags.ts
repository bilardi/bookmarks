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

// How many different tags appear together with each tag, the tag itself counted,
// over the items given: bookmarks-v3.0 ordered and colored its tags by this.
export function tagConnections(items: { tags: string[] }[]): Map<string, number> {
  const together = new Map<string, Set<string>>();
  for (const item of items) {
    for (const tag of item.tags) {
      const seen = together.get(tag) ?? new Set<string>();
      for (const other of item.tags) seen.add(other);
      together.set(tag, seen);
    }
  }
  return new Map([...together].map(([tag, seen]) => [tag, seen.size]));
}

export const TAG_TONES = 5;

// 1 when a tag appears alone, up to 5 when it appears with four or more others.
export function tagTone(connections: number): number {
  return Math.min(Math.max(connections, 1), TAG_TONES);
}

// The most connected first, and by name among equals.
export function byConnections(tags: string[], connections: Map<string, number>): string[] {
  return [...tags].sort((a, b) => (connections.get(b) ?? 0) - (connections.get(a) ?? 0) || a.localeCompare(b));
}
