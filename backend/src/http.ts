import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";

export type ApiEvent = APIGatewayProxyEventV2WithJWTAuthorizer;
export type JsonResult = Exclude<APIGatewayProxyResultV2, string>;

export function json(statusCode: number, body: unknown): JsonResult {
  const result: JsonResult = {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
  return result;
}

export interface Caller {
  userId: string;
  name: string;
  email: string;
}

// API Gateway lowercases header names, sam local rebuilds them capitalised: read
// them without caring about the case, so both environments behave the same.
function headerOf(event: ApiEvent, name: string): string | undefined {
  const headers = event.headers ?? {};
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  return key === undefined ? undefined : headers[key];
}

export function callerOf(event: ApiEvent): Caller {
  const claims = event.requestContext.authorizer?.jwt?.claims as
    | Record<string, unknown>
    | undefined;
  if (claims?.sub) {
    const userId = String(claims.sub);
    const email = String(claims.email ?? "").toLowerCase();
    return { userId, name: String(claims.name ?? claims.email ?? userId), email };
  }
  // Local runs have no Cognito authorizer: take the user from a header, gated by
  // LOCAL so production never accepts it.
  if (process.env.LOCAL === "true") {
    const header = headerOf(event, "x-dev-user");
    const userId = header && header.length > 0 ? header : "dev-user";
    const name = headerOf(event, "x-dev-name");
    const email = headerOf(event, "x-dev-email") ?? "";
    return { userId, name: name && name.length > 0 ? name : userId, email: email.toLowerCase() };
  }
  throw new Error("missing authorizer claims");
}

// A body that is not JSON becomes no body at all, and the schema refuses it with a
// 400: a parse error must not surface as a 500.
export function readBody(event: ApiEvent): unknown {
  if (!event.body) return undefined;
  try {
    return JSON.parse(event.body);
  } catch {
    return undefined;
  }
}

export function queryOf(event: ApiEvent, name: string): string | undefined {
  return event.queryStringParameters?.[name];
}

// Writing routes want a header that a form on another site cannot send: with the
// token in a cookie, this is what closes the door to cross-site requests left open
// by SameSite alone.
export function hasRequestHeader(event: ApiEvent): boolean {
  return headerOf(event, "x-bookmarks-request") !== undefined;
}
