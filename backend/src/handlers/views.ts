import { viewBodySchema } from "@bookmarks/core";

import { callerOf, json, queryOf, readBody, type ApiEvent, type JsonResult } from "../http";
import { respond } from "../result";
import { setView } from "../operations/views";

export async function views(event: ApiEvent): Promise<JsonResult> {
  const caller = callerOf(event);
  if (event.routeKey !== "PUT /items/{id}/view") return json(404, { error: "unknown-route" });
  const parsed = viewBodySchema.safeParse(readBody(event));
  if (!parsed.success) return json(400, { error: "invalid-body" });
  const owner = queryOf(event, "owner") ?? caller.userId;
  return respond(await setView(caller, owner, event.pathParameters?.id ?? "", parsed.data));
}
