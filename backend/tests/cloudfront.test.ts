import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";

interface CloudFrontRequest {
  uri: string;
  headers: Record<string, { value: string }>;
}

// The body of FunctionCode of one function of sam/site.yaml, indented by eight
// spaces under the key, turned into the handler it defines.
function functionOf(name: string): (event: { request: CloudFrontRequest }) => CloudFrontRequest {
  const yaml = readFileSync(new URL("../../sam/site.yaml", import.meta.url), "utf8");
  const start = yaml.indexOf(`\n  ${name}:\n`);
  const marker = "FunctionCode: |\n";
  const body = yaml.slice(yaml.indexOf(marker, start) + marker.length);
  const lines: string[] = [];
  for (const line of body.split("\n")) {
    if (!line.startsWith("        ")) break;
    lines.push(line.slice(8));
  }
  return new Function(`${lines.join("\n")}\nreturn handler;`)();
}

function request(uri: string, headers: Record<string, { value: string }> = {}): { request: CloudFrontRequest } {
  return { request: { uri, headers } };
}

describe("StripApiPrefix", () => {
  const stripApiPrefix = functionOf("StripApiPrefix");

  it("removes the prefix and leaves the bearer token alone", () => {
    const out = stripApiPrefix(request("/api/items/1", { authorization: { value: "Bearer t" } }));
    expect(out.uri).toBe("/items/1");
    expect(out.headers.authorization).toEqual({ value: "Bearer t" });
  });

  it("maps the bare prefix to the root", () => {
    expect(stripApiPrefix(request("/api")).uri).toBe("/");
  });
});

describe("AppRoutes", () => {
  const appRoutes = functionOf("AppRoutes");

  it("serves the page for a route of the app, and leaves files alone", () => {
    expect(appRoutes(request("/lessons/english")).uri).toBe("/index.html");
    expect(appRoutes(request("/assets/index.js")).uri).toBe("/assets/index.js");
  });
});
