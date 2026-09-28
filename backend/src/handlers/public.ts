import type { APIGatewayProxyEventV2 } from "aws-lambda";

import { json, type JsonResult } from "../http";
import { listPublic } from "../operations/public";

// The one route without a login. CloudFront keeps the answer five minutes, so a
// visitor reloading the page does not reach this function every time.
export async function publicItems(event: APIGatewayProxyEventV2): Promise<JsonResult> {
  if (event.routeKey !== "GET /public/items") return json(404, { error: "unknown-route" });
  const res = json(200, await listPublic());
  return { ...res, headers: { ...res.headers, "cache-control": "public, max-age=300" } };
}
