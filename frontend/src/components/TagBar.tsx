import { bookmarksPath } from "../router";
import { Link } from "./Link";

interface Props {
  owner?: string;
  path: string;
  selected: string[];
  available: string[];
}

// The selected tags first, each with an x that takes it away, then the tags that
// still narrow the list: selecting "lessons" offers "english" and "spanish", not
// every lesson of both courses.
export function TagBar({ owner, path, selected, available }: Props) {
  if (selected.length === 0 && available.length === 0) return null;
  return (
    <div className="tags" aria-label="Tags">
      {selected.map((tag) => (
        <Link key={tag} className="tag selected" to={bookmarksPath(owner, path, selected.filter((t) => t !== tag))}>
          {`${tag} x`}
        </Link>
      ))}
      {available.map((tag) => (
        <Link key={tag} className="tag" to={bookmarksPath(owner, path, [...selected, tag])}>
          {tag}
        </Link>
      ))}
    </div>
  );
}
