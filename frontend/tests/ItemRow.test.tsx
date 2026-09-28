import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ItemRow } from "../src/components/ItemRow";
import { mockApi } from "./fetchMock";
import { item } from "./items";

afterEach(() => {
  vi.restoreAllMocks();
});

function row(props: Partial<Parameters<typeof ItemRow>[0]> = {}) {
  return render(
    <ul>
      <ItemRow item={item()} own hiddenTags={[]} showPath={false} onChange={() => undefined} {...props} />
    </ul>,
  );
}

describe("ItemRow", () => {
  it("offers arrows and the full pencil on own items", () => {
    row({ up: "i0" });
    expect(screen.getByRole("button", { name: "Move up" })).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: "Move down" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
  });

  it("offers only the personal view on the items of others", () => {
    row({ own: false, owner: "o1" });
    expect(screen.queryByRole("button", { name: "Move up" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit your note" }));
    expect(screen.getByLabelText("Your note")).toBeTruthy();
    expect(screen.queryByLabelText("Title")).toBeNull();
  });

  it("marks the item seen in the view of its owner", async () => {
    const calls = mockApi({ "PUT /api/items/i1/view": { seen: true, flag: false, note: "" } });
    row({ own: false, owner: "o1" });

    fireEvent.click(screen.getByRole("button", { name: "Not seen" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Seen" })).toBeTruthy());
    expect(calls[0]).toEqual({ method: "PUT", url: "/api/items/i1/view?owner=o1", body: { seen: true, flag: false, note: "" } });
  });

  it("goes back when the view cannot be saved, and says why", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    row();

    fireEvent.click(screen.getByRole("button", { name: "Flag" }));

    expect((await screen.findByRole("alert")).textContent).toBe("The API is not answering");
    expect(screen.getByRole("button", { name: "Flag" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("keeps the text icon in its place, and turns it off when there is nothing to read", () => {
    const { unmount } = row();
    expect(screen.getByRole("button", { name: "Text" })).toHaveProperty("disabled", true);
    unmount();
    row({ item: item({ text: "read this" }) });
    fireEvent.click(screen.getByRole("button", { name: "Text" }));
    expect(screen.getByText("read this")).toBeTruthy();
  });

  it("makes the title of a note clickable only when there is something to read", () => {
    const { unmount } = row({ item: item({ title: "Empty" }) });
    expect(screen.queryByRole("button", { name: "Empty" })).toBeNull();
    expect(screen.getByText("Empty")).toBeTruthy();
    unmount();
    row({ item: item({ title: "Shared", text: "from the owner" }), own: false, owner: "o1" });
    fireEvent.click(screen.getByRole("button", { name: "Shared" }));
    expect(screen.getByText("from the owner")).toBeTruthy();
  });

  it("opens a link in another tab, with no reference back", () => {
    row({ item: item({ title: "Docs", link: "https://example.com/" }) });
    const link = screen.getByRole("link", { name: "Docs" });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("shows the tags not already selected, and the folder when the list mixes folders", () => {
    row({ item: item({ path: "lessons", tags: ["lessons", "grammar"] }), hiddenTags: ["lessons"], showPath: true });
    expect(screen.getByText("grammar")).toBeTruthy();
    expect(screen.queryByText("lessons", { selector: ".tag" })).toBeNull();
    expect(screen.getByText("lessons", { selector: ".path" })).toBeTruthy();
  });
});
