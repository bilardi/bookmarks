import { useEffect, useState } from "react";

// Every address of the site, in one place: the pages, the menu and the login read
// them from here. afterLogin is the origin itself, because the callbacks of the pool
// list it without a trailing slash; afterLogout is the LogoutPath of sam/auth.yaml.
export const PATHS = {
  mine: "/",
  folders: "/my",
  shared: "/shared",
  usage: "/usage",
  public: "/public",
  afterLogin: "",
  afterLogout: "/public",
} as const;

// The own bookmarks at / and under /my, the bookmarks of the others under /shared,
// the public ones at /public, the tags of a filter in the query. Folder names and
// ids carry no dot, so the function of CloudFront serves the page for every one of
// these addresses.
export type Route =
  | { name: "bookmarks"; owner?: string; path: string; tags: string[] }
  | { name: "shared" }
  | { name: "usage" }
  | { name: "public"; tags: string[] };

export function parseRoute(pathname: string, search = ""): Route {
  const parts = pathname.split("/").filter((p) => p.length > 0).map(decodeURIComponent);
  const tags = (new URLSearchParams(search).get("tags") ?? "").split(",").filter((t) => t.length > 0);
  const first = `/${parts[0] ?? ""}`;
  if (first === PATHS.usage && parts.length === 1) return { name: "usage" };
  if (first === PATHS.public && parts.length === 1) return { name: "public", tags };
  if (first === PATHS.shared) {
    if (parts.length === 1) return { name: "shared" };
    return { name: "bookmarks", owner: parts[1], path: parts.slice(2).join("/"), tags };
  }
  if (first === PATHS.folders) return { name: "bookmarks", path: parts.slice(1).join("/"), tags };
  return { name: "bookmarks", path: "", tags };
}

function withTags(base: string, tags: string[]): string {
  return tags.length > 0 ? `${base}?tags=${tags.join(",")}` : base;
}

export function bookmarksPath(owner: string | undefined, path: string, tags: string[] = []): string {
  const folder = path === "" ? "" : `/${path}`;
  const base =
    owner === undefined ? (path === "" ? PATHS.mine : `${PATHS.folders}${folder}`) : `${PATHS.shared}/${owner}${folder}`;
  return withTags(base, tags);
}

export function publicPath(tags: string[] = []): string {
  return withTags(PATHS.public, tags);
}

// No router library: push the address, then tell the app the route changed.
export function navigate(to: string): void {
  window.history.pushState({}, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function useRoute(): Route {
  const read = (): Route => parseRoute(window.location.pathname, window.location.search);
  const [route, setRoute] = useState<Route>(read);
  useEffect(() => {
    const onPop = (): void => setRoute(read());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return route;
}
