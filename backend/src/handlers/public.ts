import type { APIGatewayProxyEventV2 } from "aws-lambda";

import { json, type JsonResult } from "../http";
import { listPublic } from "../operations/public";

// The one read without a login. On AWS it arrives through the function URL, which
// only CloudFront may call and which names every path $default; locally, through
// the HTTP API route that sam local serves. CloudFront keeps the answer five minutes.
function isPublicItems(event: APIGatewayProxyEventV2): boolean {
  if (event.routeKey === "GET /public/items") return true;
  return event.routeKey === "$default" && event.requestContext?.http?.method === "GET" && event.rawPath === "/public/items";
}

export async function publicItems(event: APIGatewayProxyEventV2): Promise<JsonResult> {
  if (!isPublicItems(event)) return json(404, { error: "unknown-route" });
  const res = json(200, await listPublic());
  return { ...res, headers: { ...res.headers, "cache-control": "public, max-age=300" } };
}
