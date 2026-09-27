import { PATH_DEPTH_MAX } from "./limits";
import { normalizeName } from "./names";

// The root is the empty path; any other path is a list of names joined by "/".
export function normalizePath(raw: string): string | null {
  const parts = raw
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length > PATH_DEPTH_MAX) return null;
  const names = parts.map(normalizeName);
  if (names.some((name) => name === null)) return null;
  return names.join("/");
}

// The root first, then every folder above the path, then the path itself.
export function ancestors(path: string): string[] {
  if (path === "") return [""];
  const parts = path.split("/");
  return ["", ...parts.map((_, i) => parts.slice(0, i + 1).join("/"))];
}

export function isInside(path: string, folder: string): boolean {
  return folder === "" || path === folder || path.startsWith(`${folder}/`);
}

export function isDirectChild(path: string, parent: string): boolean {
  if (path === "" || path === parent || !isInside(path, parent)) return false;
  const rest = parent === "" ? path : path.slice(parent.length + 1);
  return !rest.includes("/");
}

// The same path under another folder: rebase("a/b/c", "a/b", "x") is "x/c".
export function rebase(path: string, from: string, to: string): string {
  if (path === from) return to;
  const rest = from === "" ? path : path.slice(from.length + 1);
  return to === "" ? rest : `${to}/${rest}`;
}
