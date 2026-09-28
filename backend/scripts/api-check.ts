// Checks the HTTP API end to end, against the locally running system: this is the
// layer the unit tests never reach, where the routes of the template meet the
// route keys of the handlers, and where the event shape and the header names live.
// No route here signs a URL, because sam local has no credentials to sign with.
import "../tests/setup";

import { wipeUsers } from "../tests/helpers";

const BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:3000";

// One run, one set of names.
const RUN = `api-check-${Date.now()}`;
const USER = `${RUN}-u1`;

interface Answer {
  status: number;
  body: unknown;
}

async function call(method: string, path: string, body?: unknown): Promise<Answer> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", "x-dev-user": USER },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text.length === 0 ? null : JSON.parse(text);
  } catch {
    // Not JSON: kept as text, the check looks at the status only.
  }
  return { status: res.status, body: parsed };
}

let failures = 0;

function check(name: string, answer: Answer, status: number, error?: string): void {
  const body = (answer.body ?? {}) as Record<string, unknown>;
  if (answer.status === status && (error === undefined || body.error === error)) {
    console.log(`ok   ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL ${name} -> ${JSON.stringify(answer)}`);
}

try {
  check("GET /public/items reaches the public function", await call("GET", "/public/items"), 200);
  check("GET /me reaches the items function", await call("GET", "/me"), 200);
  check("GET /me/usage answers without prices", await call("GET", "/me/usage"), 200);
  check("GET /owners", await call("GET", "/owners"), 200);
  check("GET /tags", await call("GET", "/tags"), 200);
  check("POST /folders", await call("POST", "/folders", { path: "a" }), 200);
  check("GET /folders", await call("GET", "/folders?path="), 200);
  check("PATCH /folders", await call("PATCH", "/folders", { path: "a", newPath: "b" }), 200);
  check("PUT /folders/share", await call("PUT", "/folders/share", { path: "b", shared: false }), 200);
  check("DELETE /folders", await call("DELETE", "/folders?path=b"), 200);

  check("POST /items with a body that is not valid", await call("POST", "/items", { title: "" }), 400, "invalid-body");
  const created = await call("POST", "/items", { title: "note", tags: ["x"] });
  check("POST /items", created, 200);
  const id = (created.body as { id: string }).id;
  check("GET /items by folder", await call("GET", "/items?path="), 200);
  check("GET /items by tags", await call("GET", "/items?tags=x"), 200);
  check("PATCH /items/{id}", await call("PATCH", `/items/${id}`, { title: "renamed" }), 200);
  check("POST /items/{id}/move", await call("POST", `/items/${id}/move`, { direction: "up", adjacentId: id }), 400, "not-adjacent");
  check("PUT /items/{id}/view reaches the views function", await call("PUT", `/items/${id}/view`, { seen: true, flag: false, note: "" }), 200);
  check("POST /items/{id}/upload reaches the files function", await call("POST", `/items/${id}/upload`), 400, "no-file");
  check("GET /items/{id}/download reaches the files function", await call("GET", `/items/${id}/download`), 400, "no-file");
  check("DELETE /items/{id}", await call("DELETE", `/items/${id}`), 200);
} finally {
  await wipeUsers([USER]);
}

console.log("");
if (failures === 0) {
  console.log("all checks passed");
} else {
  console.log(`${failures} check(s) failed`);
  process.exit(1);
}
