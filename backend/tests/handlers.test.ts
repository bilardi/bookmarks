import { beforeEach, describe, expect, it } from "vitest";

import type { APIGatewayProxyEventV2WithJWTAuthorizer, S3Event } from "aws-lambda";

import { makeItems } from "../src/handlers/items";
import { makeFiles } from "../src/handlers/files";
import { views } from "../src/handlers/views";
import { fileEvents } from "../src/handlers/fileEvents";
import { publicItems } from "../src/handlers/public";
import { getItem } from "../src/repository/items";
import { wipeUsers } from "./helpers";
import { fakeStorage } from "./fakeStorage";

const SUB = "handlers-a";
const OTHER = "handlers-b";
const items = makeItems(fakeStorage());
const files = makeFiles(fakeStorage(), 1000);

// Minimal HTTP API v2 event with a JWT authorizer claim.
function event(
  routeKey: string,
  options: {
    sub?: string;
    body?: string;
    pathParameters?: Record<string, string>;
    query?: Record<string, string>;
  } = {},
): APIGatewayProxyEventV2WithJWTAuthorizer {
  const [method] = routeKey.split(" ");
  return {
    version: "2.0",
    routeKey,
    rawPath: "",
    rawQueryString: "",
    headers: {},
    queryStringParameters: options.query,
    requestContext: {
      http: { method, path: "", protocol: "HTTP/1.1", sourceIp: "127.0.0.1", userAgent: "test" },
      authorizer: { jwt: { claims: { sub: options.sub ?? SUB, name: "Ada", email: "ada@test" }, scopes: [] } },
    },
    pathParameters: options.pathParameters,
    body: options.body,
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

function bodyOf(res: { body?: string }): any {
  return JSON.parse(res.body ?? "null");
}

beforeEach(async () => {
  await wipeUsers([SUB, OTHER]);
});

describe("items handler", () => {
  it("creates and lists an item", async () => {
    const created = await items(event("POST /items", { body: JSON.stringify({ title: "a", path: "x" }) }));
    expect(created.statusCode).toBe(200);
    const listed = await items(event("GET /items", { query: { path: "x" } }));
    expect(bodyOf(listed).map((i: { title: string }) => i.title)).toEqual(["a"]);
  });

  it("accepts a write with no header beyond the token", async () => {
    const res = await items(event("POST /items", { body: JSON.stringify({ title: "a" }) }));
    expect(res.statusCode).toBe(200);
  });

  it("answers 400 to a body that is not JSON", async () => {
    expect((await items(event("POST /items", { body: "{" }))).statusCode).toBe(400);
  });

  it("answers 400 to a text of 251 characters", async () => {
    const res = await items(event("POST /items", { body: JSON.stringify({ title: "a", text: "x".repeat(251) }) }));
    expect(res.statusCode).toBe(400);
  });

  it("answers 400 to an invalid path or tag in the query", async () => {
    expect((await items(event("GET /items", { query: { path: "a b" } }))).statusCode).toBe(400);
    expect((await items(event("GET /items", { query: { tags: "a b" } }))).statusCode).toBe(400);
  });

  it("filters by tags given in the query", async () => {
    await items(event("POST /items", { body: JSON.stringify({ title: "a", tags: ["x", "y"] }) }));
    await items(event("POST /items", { body: JSON.stringify({ title: "b", tags: ["x"] }) }));
    const res = await items(event("GET /items", { query: { tags: "x,y" } }));
    expect(bodyOf(res).map((i: { title: string }) => i.title)).toEqual(["a"]);
  });

  it("answers 404 to the item of another user and to an unknown route", async () => {
    const created = bodyOf(await items(event("POST /items", { body: JSON.stringify({ title: "a" }) })));
    const res = await items(event("DELETE /items/{id}", { sub: OTHER, pathParameters: { id: created.id } }));
    expect(res.statusCode).toBe(404);
    expect((await items(event("GET /nothing"))).statusCode).toBe(404);
  });
});

describe("files and views handlers", () => {
  it("answers 403 to a download of an unshared item of somebody else", async () => {
    const created = bodyOf(
      await items(event("POST /items", { body: JSON.stringify({ title: "f", file: { name: "a.pdf", contentType: "application/pdf" } }) })),
    );
    const res = await files(
      event("GET /items/{id}/download", { sub: OTHER, pathParameters: { id: created.id }, query: { owner: SUB } }),
    );
    expect(res.statusCode).toBe(403);
  });

  it("writes a personal view on an own item", async () => {
    const created = bodyOf(await items(event("POST /items", { body: JSON.stringify({ title: "a" }) })));
    const view = { seen: true, flag: false, note: "" };
    const res = await views(event("PUT /items/{id}/view", { pathParameters: { id: created.id }, body: JSON.stringify(view) }));
    expect(res.statusCode).toBe(200);
    expect(bodyOf(res)).toEqual(view);
  });
});

describe("file events handler", () => {
  it("decodes the key of the event", async () => {
    const created = bodyOf(
      await items(event("POST /items", { body: JSON.stringify({ title: "f", file: { name: "a.pdf", contentType: "application/pdf" } }) })),
    );
    const key = `files/${SUB}/${created.id}`;
    await fileEvents({ Records: [{ s3: { object: { key: encodeURIComponent(key), size: 42 } } }] } as unknown as S3Event);
    expect((await getItem(SUB, created.id))?.file?.status).toBe("ready");
  });
});

describe("public handler", () => {
  it("answers without a token, and lets CloudFront keep the answer five minutes", async () => {
    const res = await publicItems({ routeKey: "GET /public/items", headers: {} } as unknown as Parameters<typeof publicItems>[0]);
    expect(res.statusCode).toBe(200);
    expect(res.headers?.["cache-control"]).toBe("public, max-age=300");
    expect(Array.isArray(JSON.parse(String(res.body)))).toBe(true);
  });

  it("answers CloudFront through the function URL, where every path arrives as $default", async () => {
    const res = await publicItems({
      routeKey: "$default",
      rawPath: "/public/items",
      requestContext: { http: { method: "GET" } },
    } as unknown as Parameters<typeof publicItems>[0]);
    expect(res.statusCode).toBe(200);
    expect(res.headers?.["cache-control"]).toBe("public, max-age=300");
  });

  it("refuses any other path of the function URL", async () => {
    const res = await publicItems({
      routeKey: "$default",
      rawPath: "/items",
      requestContext: { http: { method: "GET" } },
    } as unknown as Parameters<typeof publicItems>[0]);
    expect(res.statusCode).toBe(404);
  });
});
