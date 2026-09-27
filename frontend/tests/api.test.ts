import { afterEach, describe, expect, it, vi } from "vitest";

import { deleteFolder, listItems, moveItem, putView, uploadFile } from "../src/api";
import { mockApi } from "./fetchMock";

afterEach(() => {
  vi.restoreAllMocks();
});

async function reasonOf(call: () => Promise<unknown>): Promise<string> {
  try {
    await call();
  } catch (e: unknown) {
    return e instanceof Error ? e.message : String(e);
  }
  throw new Error("the call was expected to fail");
}

describe("addresses", () => {
  it("names the owner and the folder in the query, and leaves out what is not given", async () => {
    const calls = mockApi({ "GET /api/items": [] });
    await listItems(undefined, "");
    await listItems("o1", "lessons/english");
    expect(calls.map((c) => c.url)).toEqual(["/api/items?path=", "/api/items?owner=o1&path=lessons%2Fenglish"]);
  });

  it("sends the personal view to the item of its owner", async () => {
    const calls = mockApi({ "PUT /api/items/i1/view": { seen: true, flag: false, note: "" } });
    await putView("o1", "i1", { seen: true, flag: false, note: "" });
    expect(calls[0]).toEqual({ method: "PUT", url: "/api/items/i1/view?owner=o1", body: { seen: true, flag: false, note: "" } });
  });

  it("deletes a folder named in the query", async () => {
    const calls = mockApi({ "DELETE /api/folders": { path: "a" } });
    await deleteFolder("a/b");
    expect(calls[0].url).toBe("/api/folders?path=a%2Fb");
  });
});

describe("failures", () => {
  it("says the API is not answering when nothing is behind it", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await reasonOf(() => listItems(undefined, ""))).toBe("The API is not answering");
  });

  it("turns the error of the answer into a sentence", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "not-adjacent" }), { status: 400 }));
    expect(await reasonOf(() => moveItem("i1", { direction: "up", adjacentId: "i2" }))).toBe(
      "An item moves only past its neighbor in the same folder",
    );
  });
});

describe("uploadFile", () => {
  it("posts the signed fields first and the file last, to S3 and without a token", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    const file = new File(["abc"], "l1.mp3", { type: "audio/mpeg" });

    await uploadFile({ url: "https://bucket.s3.eu-west-1.amazonaws.com/", fields: { key: "files/u/i", Policy: "p" } }, file);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://bucket.s3.eu-west-1.amazonaws.com/");
    expect(init?.headers).toBeUndefined();
    const form = init?.body as FormData;
    expect([...form.keys()]).toEqual(["key", "Policy", "file"]);
  });

  it("says so when S3 refuses the file", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<Error/>", { status: 400 }));
    const file = new File(["abc"], "l1.mp3", { type: "audio/mpeg" });
    expect(await reasonOf(() => uploadFile({ url: "https://s3/", fields: {} }, file))).toBe(
      "S3 refused the file: it may be larger than allowed",
    );
  });
});
