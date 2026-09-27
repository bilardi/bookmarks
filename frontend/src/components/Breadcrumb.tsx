import { bookmarksPath } from "../router";
import { Link } from "./Link";

// The folders above the current one, each a way back up.
export function Breadcrumb({ owner, ownerName, path }: { owner?: string; ownerName: string; path: string }) {
  const parts = path === "" ? [] : path.split("/");
  return (
    <nav className="breadcrumb" aria-label="Folders">
      <Link to={bookmarksPath(owner, "")}>{ownerName}</Link>
      {parts.map((part, i) => (
        <span key={parts.slice(0, i + 1).join("/")}>
          {" / "}
          <Link to={bookmarksPath(owner, parts.slice(0, i + 1).join("/"))}>{part}</Link>
        </span>
      ))}
    </nav>
  );
}
