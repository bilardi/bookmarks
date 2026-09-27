import { callerOf, json, queryOf, type ApiEvent, type JsonResult } from "../http";
import { respond } from "../result";
import { requestDownload, requestUpload } from "../operations/files";
import type { Storage } from "../storage";

export function makeFiles(storage: Storage, maxBytes: number) {
  return async function files(event: ApiEvent): Promise<JsonResult> {
    const caller = callerOf(event);
    const id = event.pathParameters?.id ?? "";
    if (event.routeKey === "POST /items/{id}/upload") {
      return respond(await requestUpload(caller, id, storage, maxBytes));
    }
    if (event.routeKey === "GET /items/{id}/download") {
      const owner = queryOf(event, "owner") ?? caller.userId;
      return respond(await requestDownload(caller, owner, id, storage));
    }
    return json(404, { error: "unknown-route" });
  };
}
