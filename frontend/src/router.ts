import { useEffect, useState } from "react";

// The own bookmarks at / and under /my, the bookmarks of the others under /shared,
// the tags of a filter in the query. Folder names and ids carry no dot, so the
// function of CloudFront serves the page for every one of these addresses.
export type Route =
  | { name: "bookmarks"; owner?: string; path: string; tags: string[] }
  | { name: "shared" }
  | { name: "usage" };

export function parseRoute(pathname: string, search = ""): Route {
  const parts = pathname.split("/").filter((p) => p.length > 0).map(decodeURIComponent);
  const tags = (new URLSearchParams(search).get("tags") ?? "").split(",").filter((t) => t.length > 0);
  if (parts[0] === "usage" && parts.length === 1) return { name: "usage" };
  if (parts[0] === "shared") {
    if (parts.length === 1) return { name: "shared" };
    return { name: "bookmarks", owner: parts[1], path: parts.slice(2).join("/"), tags };
  }
  if (parts[0] === "my") return { name: "bookmarks", path: parts.slice(1).join("/"), tags };
  return { name: "bookmarks", path: "", tags };
}

export function bookmarksPath(owner: string | undefined, path: string, tags: string[] = []): string {
  const folder = path === "" ? "" : `/${path}`;
  const base = owner === undefined ? (path === "" ? "/" : `/my${folder}`) : `/shared/${owner}${folder}`;
  return tags.length > 0 ? `${base}?tags=${tags.join(",")}` : base;
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
