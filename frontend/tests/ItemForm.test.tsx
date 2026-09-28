import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ItemForm } from "../src/components/ItemForm";
import { mockApi } from "./fetchMock";
import { item } from "./items";

afterEach(() => {
  vi.restoreAllMocks();
});

function fill(label: string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("ItemForm", () => {
  it("creates a link in the current folder, with its tags normalized", async () => {
    const calls = mockApi({ "GET /api/folders": [], "GET /api/tags": [], "POST /api/items": item() });
    const onSaved = vi.fn();
    render(<ItemForm path="lessons" onSaved={onSaved} onClose={() => undefined} />);

    fill("Title", "Docs");
    fill("Web address", "https://example.com/");
    fill("Tags", "Grammar, verbs");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const post = calls.find((c) => c.method === "POST");
    expect(post?.body).toEqual({
      title: "Docs",
      link: "https://example.com/",
      path: "lessons",
      tags: ["grammar", "verbs"],
      shared: false,
      published: false,
    });
  });

  it("lets the curator publish a link, which is then shared too", async () => {
    const calls = mockApi({ "GET /api/folders": [], "GET /api/tags": [], "POST /api/items": item() });
    render(<ItemForm path="" curator onSaved={() => undefined} onClose={() => undefined} />);

    fill("Title", "Docs");
    fill("Web address", "https://example.com/");
    fireEvent.click(screen.getByLabelText("Public, for everybody without a login"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({ published: true, shared: true });
  });

  it("offers the publication only to the curator", () => {
    mockApi({ "GET /api/folders": [], "GET /api/tags": [] });
    render(<ItemForm path="" onSaved={() => undefined} onClose={() => undefined} />);
    expect(screen.queryByLabelText("Public, for everybody without a login")).toBeNull();
  });

  it("refuses a link that is not a web address, before calling the API", async () => {
    const calls = mockApi({ "GET /api/folders": [], "GET /api/tags": [] });
    render(<ItemForm path="" onSaved={() => undefined} onClose={() => undefined} />);

    fill("Title", "Bad");
    fill("Web address", "javascript:alert(1)");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect((await screen.findByRole("alert")).textContent).toBe("The link must start with http:// or https://");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("says so when the file does not reach S3", async () => {
    mockApi({
      "GET /api/folders": [],
      "GET /api/tags": [],
      "POST /api/items": item({ id: "f1" }),
      "POST /api/items/f1/upload": { url: "https://s3.test/", fields: { key: "files/u1/f1" } },
    });
    const fetchSpy = vi.mocked(globalThis.fetch);
    const original = fetchSpy.getMockImplementation()!;
    fetchSpy.mockImplementation(async (input, init) =>
      String(input) === "https://s3.test/" ? new Response("", { status: 403 }) : original(input, init),
    );
    const onSaved = vi.fn();
    render(<ItemForm path="" onSaved={onSaved} onClose={() => undefined} />);

    fill("Title", "Lesson");
    fireEvent.click(screen.getByLabelText("File"));
    fireEvent.change(screen.getByLabelText("Choose the file"), {
      target: { files: [new File(["abc"], "l1.mp3", { type: "audio/mpeg" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "The item was created, but the file did not reach S3: The upload failed (403). Delete the item and add it again.",
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("edits an own item, removing the text when it is emptied", async () => {
    const calls = mockApi({ "GET /api/folders": [], "GET /api/tags": [], "PATCH /api/items/i1": item() });
    const onSaved = vi.fn();
    render(<ItemForm item={item({ text: "old" })} path="" onSaved={onSaved} onClose={() => undefined} />);

    fill("Text", "");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(calls.find((c) => c.method === "PATCH")?.body).toMatchObject({ text: null });
  });

  it("deletes only after confirmation", async () => {
    const calls = mockApi({ "GET /api/folders": [], "GET /api/tags": [], "DELETE /api/items/i1": { id: "i1" } });
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<ItemForm item={item()} path="" onSaved={() => undefined} onClose={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    // The first action has to end, and the button to be back, before the second.
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() => expect(calls.filter((c) => c.method === "DELETE")).toHaveLength(1));
    expect(confirm).toHaveBeenCalledTimes(2);
  });
});
