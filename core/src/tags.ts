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
