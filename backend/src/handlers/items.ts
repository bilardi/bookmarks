import {
  createItemBodySchema,
  folderBodySchema,
  moveBodySchema,
  normalizePath,
  normalizeTag,
  patchItemBodySchema,
  renameFolderBodySchema,
  shareFolderBodySchema,
} from "@bookmarks/core";

import { callerOf, hasRequestHeader, json, queryOf, readBody, type ApiEvent, type JsonResult } from "../http";
import { ok, respond } from "../result";
import { createFolder, deleteFolder, listFoldersOf, renameFolder, shareFolder } from "../operations/folders";
import { createItem, deleteItem, filterItems, listFolder, listTags, moveItem, updateItem } from "../operations/items";
import { getMe, getUsage, listOwnersFor } from "../operations/me";
import { pricesFromEnv } from "../prices";
import type { Storage } from "../storage";

const INVALID = json(400, { error: "invalid-body" });

// A path in the query follows the rule of paths, the root being the empty one.
function pathQuery(event: ApiEvent): string | null {
  return normalizePath(queryOf(event, "path") ?? "");
}

function tagsQuery(event: ApiEvent): string[] | null {
  const raw = queryOf(event, "tags");
  if (raw === undefined) return null;
  const tags = raw.split(",").map(normalizeTag);
  return tags.length > 0 && tags.every((tag) => tag !== null) ? (tags as string[]) : null;
}

export function makeItems(storage: Storage) {
  return async function items(event: ApiEvent): Promise<JsonResult> {
    const caller = callerOf(event);
    const owner = queryOf(event, "owner") ?? caller.userId;
    const id = event.pathParameters?.id ?? "";
    if (event.requestContext.http.method !== "GET" && !hasRequestHeader(event)) {
      return json(403, { error: "missing-request-header" });
    }

    switch (event.routeKey) {
      case "GET /me":
        return respond(ok(await getMe(caller, process.env.CURATOR_EMAIL ?? "")));
      case "GET /me/usage":
        return respond(ok(await getUsage(caller, pricesFromEnv(process.env))));
      case "GET /owners":
        return respond(ok(await listOwnersFor(caller)));
      case "GET /tags":
        return respond(await listTags(caller, owner));
      case "GET /folders": {
        if (queryOf(event, "path") === undefined) return respond(await listFoldersOf(caller, owner, undefined));
        const path = pathQuery(event);
        return path === null ? INVALID : respond(await listFoldersOf(caller, owner, path));
      }
      case "POST /folders": {
        const parsed = folderBodySchema.safeParse(readBody(event));
        return parsed.success ? respond(await createFolder(caller, parsed.data.path)) : INVALID;
      }
      case "PATCH /folders": {
        const parsed = renameFolderBodySchema.safeParse(readBody(event));
        return parsed.success ? respond(await renameFolder(caller, parsed.data.path, parsed.data.newPath)) : INVALID;
      }
      case "PUT /folders/share": {
        const parsed = shareFolderBodySchema.safeParse(readBody(event));
        return parsed.success ? respond(await shareFolder(caller, parsed.data.path, parsed.data.shared)) : INVALID;
      }
      case "DELETE /folders": {
        const path = pathQuery(event);
        return path === null ? INVALID : respond(await deleteFolder(caller, path));
      }
      case "GET /items": {
        if (queryOf(event, "tags") !== undefined) {
          const tags = tagsQuery(event);
          return tags === null ? INVALID : respond(await filterItems(caller, owner, tags));
        }
        const path = pathQuery(event);
        return path === null ? INVALID : respond(await listFolder(caller, owner, path));
      }
      case "POST /items": {
        const parsed = createItemBodySchema.safeParse(readBody(event));
        return parsed.success ? respond(await createItem(caller, parsed.data)) : INVALID;
      }
      case "PATCH /items/{id}": {
        const parsed = patchItemBodySchema.safeParse(readBody(event));
        return parsed.success ? respond(await updateItem(caller, id, parsed.data)) : INVALID;
      }
      case "DELETE /items/{id}":
        return respond(await deleteItem(caller, id, storage));
      case "POST /items/{id}/move": {
        const parsed = moveBodySchema.safeParse(readBody(event));
        return parsed.success ? respond(await moveItem(caller, id, parsed.data)) : INVALID;
      }
    }
    return json(404, { error: "unknown-route" });
  };
}
