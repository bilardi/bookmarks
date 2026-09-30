import { byConnections, tagTone } from "@bookmarks/core";

import { Link } from "./Link";

interface Props {
  selected: string[];
  available: string[];
  // How many tags each tag appears with, over everything readable: its tone stays
  // the same while the bar narrows, as in bookmarks-v3.0.
  connections: Map<string, number>;
  // The address of the same page with other tags selected.
  pathOf: (tags: string[]) => string;
}

// The selected tags first, each with an x that takes it away, then the tags that
// still narrow the list, the most connected first: selecting "lessons" offers
// "english" and "spanish", not every lesson of both courses.
export function TagBar({ selected, available, connections, pathOf }: Props) {
  if (selected.length === 0 && available.length === 0) return null;
  return (
    <div className="tags" aria-label="Tags">
      {selected.map((tag) => (
        <Link key={tag} className="tag selected" to={pathOf(selected.filter((t) => t !== tag))}>
          {`${tag} x`}
        </Link>
      ))}
      {byConnections(available, connections).map((tag) => (
        <Link key={tag} className={`tag tone-${tagTone(connections.get(tag) ?? 0)}`} to={pathOf([...selected, tag])}>
          {tag}
        </Link>
      ))}
    </div>
  );
}
