import type {
  CreateItemBody,
  DownloadView,
  FolderView,
  ItemView,
  MeView,
  MoveBody,
  OwnerView,
  PatchItemBody,
  PublicItemView,
  TagView,
  UploadView,
  UsageView,
  ViewState,
} from "@bookmarks/core";

import { authHeaders, isCognito, login } from "./auth";

// Same origin: CloudFront, and the Vite dev proxy, route /api to the HTTP API.
const API_BASE = "/api";

// What the backend refuses, said in words: the pages show these next to the action
// that was refused, while the console keeps the method, the route and the status.
const REASONS: Record<string, string> = {
  "not-found": "Not found",
  forbidden: "This is not shared with you",
  "invalid-body": "What was sent is not valid",
  "not-adjacent": "An item moves only past its neighbor in the same folder",
  "invalid-target": "A folder cannot move inside itself",
  "link-and-file": "An item carries a link or a file, not both",
  "public-needs-link": "Only a link can be public",
  "no-file": "This item has no file",
  "root-folder": "The root folder cannot be changed",
  "folder-exists": "A folder with that name is already there",
  "folder-not-empty": "Only an empty folder can be deleted",
  "file-pending": "The file is still being uploaded",
  "file-uploaded": "The file is already uploaded",
};

const UNREACHABLE = "The API is not answering";

function reasonFor(status: number, code: string | null): string {
  if (code !== null && REASONS[code] !== undefined) return REASONS[code];
  // The gateway refuses the call before the backend sees it: the token has expired.
  if (status === 401) return "The session is over, log in again";
  if (status === 502 || status === 503 || status === 504) return UNREACHABLE;
  return `The request failed (${status}${code === null ? "" : `: ${code}`})`;
}

export function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// The backend answers { error: "<code>" }; the proxy answers whatever it likes.
function codeOf(text: string): string | null {
  try {
    const body = JSON.parse(text) as { error?: unknown };
    return typeof body.error === "string" ? body.error : null;
  } catch {
    return null;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? "GET";
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...authHeaders(), ...init?.headers },
    });
  } catch (e: unknown) {
    console.error(`${method} ${path} could not be sent`, e);
    throw new Error(UNREACHABLE);
  }
  if (!res.ok) {
    const text = await res.text();
    console.error(`${method} ${path} -> ${res.status} ${text}`);
    // The refresh token lasts an hour: when it is over, the page goes through the
    // login again, which with the session of Google still open asks nothing.
    if (res.status === 401 && isCognito) login();
    throw new Error(reasonFor(res.status, codeOf(text)));
  }
  return (await res.json()) as T;
}

function query(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined) q.set(key, value);
  const text = q.toString();
  return text === "" ? "" : `?${text}`;
}

function send(method: string, body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) };
}

// The one call without a login: the links the curator published.
export function listPublic(): Promise<PublicItemView[]> {
  return request<PublicItemView[]>("/public/items");
}

export function getMe(): Promise<MeView> {
  return request<MeView>("/me");
}

export function getUsage(): Promise<UsageView> {
  return request<UsageView>("/me/usage");
}

export function listOwners(): Promise<OwnerView[]> {
  return request<OwnerView[]>("/owners");
}

// The owner is left out for the own bookmarks: the backend takes the caller.
export function listTags(owner: string | undefined): Promise<TagView[]> {
  return request<TagView[]>(`/tags${query({ owner })}`);
}

// Without a path, every folder of the owner, for the list of the form.
export function listFolders(owner: string | undefined, path: string | undefined): Promise<FolderView[]> {
  return request<FolderView[]>(`/folders${query({ owner, path })}`);
}

export function listItems(owner: string | undefined, path: string): Promise<ItemView[]> {
  return request<ItemView[]>(`/items${query({ owner, path })}`);
}

export function filterItems(owner: string | undefined, tags: string[]): Promise<ItemView[]> {
  return request<ItemView[]>(`/items${query({ owner, tags: tags.join(",") })}`);
}

export function createItem(body: CreateItemBody): Promise<ItemView> {
  return request<ItemView>("/items", send("POST", body));
}

export function patchItem(id: string, body: PatchItemBody): Promise<ItemView> {
  return request<ItemView>(`/items/${encodeURIComponent(id)}`, send("PATCH", body));
}

export function deleteItem(id: string): Promise<{ id: string }> {
  return request<{ id: string }>(`/items/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function moveItem(id: string, body: MoveBody): Promise<ItemView> {
  return request<ItemView>(`/items/${encodeURIComponent(id)}/move`, send("POST", body));
}

export function putView(owner: string | undefined, id: string, state: ViewState): Promise<ViewState> {
  return request<ViewState>(`/items/${encodeURIComponent(id)}/view${query({ owner })}`, send("PUT", state));
}

export function createFolder(path: string): Promise<FolderView> {
  return request<FolderView>("/folders", send("POST", { path }));
}

export function renameFolder(path: string, newPath: string): Promise<FolderView> {
  return request<FolderView>("/folders", send("PATCH", { path, newPath }));
}

export function shareFolder(path: string, shared: boolean): Promise<FolderView> {
  return request<FolderView>("/folders/share", send("PUT", { path, shared }));
}

export function deleteFolder(path: string): Promise<{ path: string }> {
  return request<{ path: string }>(`/folders${query({ path })}`, { method: "DELETE" });
}

export function requestDownload(owner: string | undefined, id: string): Promise<DownloadView> {
  return request<DownloadView>(`/items/${encodeURIComponent(id)}/download${query({ owner })}`);
}

export function requestUpload(id: string): Promise<UploadView> {
  return request<UploadView>(`/items/${encodeURIComponent(id)}/upload`, { method: "POST" });
}

// The file goes to S3, not to the API: no token travels with it, and the fields of
// the signed form come first and the file last, as S3 requires.
export async function uploadFile(upload: UploadView, file: File): Promise<void> {
  const form = new FormData();
  for (const [key, value] of Object.entries(upload.fields)) form.append(key, value);
  form.append("file", file);
  let res: Response;
  try {
    res = await fetch(upload.url, { method: "POST", body: form });
  } catch (e: unknown) {
    console.error("the upload could not be sent", e);
    throw new Error("The upload could not be sent");
  }
  if (!res.ok) {
    console.error(`upload -> ${res.status} ${await res.text()}`);
    throw new Error(
      res.status === 400 ? "S3 refused the file: it may be larger than allowed" : `The upload failed (${res.status})`,
    );
  }
}
