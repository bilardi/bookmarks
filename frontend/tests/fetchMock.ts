import { vi } from "vitest";

export interface Call {
  method: string;
  url: string;
  body: unknown;
}

type Answer = unknown | ((call: Call) => unknown);

// Answers by method and path, the query left out, and keeps every call to be
// looked at. A route not listed answers 404, as the API does.
export function mockApi(routes: Record<string, Answer>): Call[] {
  const calls: Call[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : (init?.body ?? null);
    const call = { method, url, body };
    calls.push(call);
    const key = `${method} ${new URL(url, "http://localhost").pathname}`;
    if (!(key in routes)) return new Response(JSON.stringify({ error: "not-found" }), { status: 404 });
    const answer = routes[key];
    const value = typeof answer === "function" ? (answer as (c: Call) => unknown)(call) : answer;
    return new Response(JSON.stringify(value), { status: 200 });
  });
  return calls;
}
