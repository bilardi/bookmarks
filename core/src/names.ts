import { SEGMENT_MAX } from "./limits";

// A folder name and a tag name follow the same rule: lowercase letters, digits,
// hyphens and underscores. The "#" that separates the parts of a key and the "/"
// that separates the folders cannot appear.
const NAME = /^[a-z0-9][a-z0-9_-]*$/;

export function normalizeName(raw: string): string | null {
  const name = raw.trim().toLowerCase();
  return name.length <= SEGMENT_MAX && NAME.test(name) ? name : null;
}
