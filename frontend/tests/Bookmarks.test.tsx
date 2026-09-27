import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Bookmarks, neighbors } from "../src/pages/Bookmarks";
import { mockApi } from "./fetchMock";
import { item } from "./items";

afterEach(() => {
  vi.restoreAllMocks();
});

const L1 = item({ id: "l1", title: "Lesson 1", path: "lessons/english", tags: ["lessons", "english"] });
const L2 = item({ id: "l2", title: "Leccion 1", path: "lessons/spanish", tags: ["lessons", "spanish"] });

describe("Bookmarks", () => {
  it("shows the folders and the items of a folder, with every tag to pick from", async () => {
    mockApi({
      "GET /api/folders": [{ path: "lessons", itemCount: 2, sharedCount: 0 }],
      "GET /api/items": [item({ title: "A note" })],
      "GET /api/tags": [
        { name: "english", itemCount: 1, sharedCount: 0 },
        { name: "lessons", itemCount: 2, sharedCount: 0 },
      ],
    });

    render(<Bookmarks ownerName="My bookmarks" path="" tags={[]} />);

    expect(await screen.findByRole("link", { name: "lessons/" })).toBeTruthy();
    expect(screen.getByText("A note")).toBeTruthy();
    const tags = screen.getByLabelText("Tags");
    expect(within(tags).getAllByRole("link").map((a) => a.textContent)).toEqual(["english", "lessons"]);
  });

  it("offers only the tags that appear with the selected ones, and hides the folders", async () => {
    mockApi({ "GET /api/items": [L1, L2], "GET /api/tags": [] });

    render(<Bookmarks ownerName="My bookmarks" path="" tags={["lessons"]} />);

    const tags = await screen.findByLabelText("Tags");
    expect(within(tags).getAllByRole("link").map((a) => a.textContent)).toEqual(["lessons x", "english", "spanish"]);
    expect(screen.queryByRole("link", { name: "lessons/" })).toBeNull();
  });

  it("says why when the bookmarks cannot be read", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    render(<Bookmarks ownerName="My bookmarks" path="" tags={[]} />);
    expect((await screen.findByRole("alert")).textContent).toBe("The API is not answering");
  });
});

describe("neighbors", () => {
  it("moves only past a neighbor of the same folder", () => {
    const items = [
      item({ id: "a1", path: "a" }),
      item({ id: "a2", path: "a" }),
      item({ id: "b1", path: "b" }),
    ];
    expect(neighbors(items, 0)).toEqual({ up: undefined, down: "a2" });
    expect(neighbors(items, 1)).toEqual({ up: "a1", down: undefined });
    expect(neighbors(items, 2)).toEqual({ up: undefined, down: undefined });
  });
});
