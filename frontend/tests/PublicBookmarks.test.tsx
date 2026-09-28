import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PublicBookmarks } from "../src/pages/PublicBookmarks";
import { mockApi } from "./fetchMock";

afterEach(() => {
  vi.restoreAllMocks();
});

const ITEMS = [
  { id: "1", title: "Git in nuts", link: "https://git.test/", tags: ["bash", "linux", "versioning"] },
  { id: "2", title: "Tmux tips", link: "https://tmux.test/", tags: ["bash", "linux"] },
  { id: "3", title: "Glowforge", link: "https://glow.test/", tags: ["printer"] },
];

describe("PublicBookmarks", () => {
  it("shows the title of each link and nothing else on the row", async () => {
    mockApi({ "GET /api/public/items": ITEMS });
    render(<PublicBookmarks tags={[]} />);

    const list = await screen.findByRole("list");
    expect(within(list).getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href"), a.getAttribute("rel")])).toEqual([
      ["Git in nuts", "https://git.test/", "noopener noreferrer"],
      ["Tmux tips", "https://tmux.test/", "noopener noreferrer"],
      ["Glowforge", "https://glow.test/", "noopener noreferrer"],
    ]);
    expect(within(list).queryAllByRole("button")).toEqual([]);
  });

  it("narrows by tags, and offers only the tags that appear together", async () => {
    mockApi({ "GET /api/public/items": ITEMS });
    render(<PublicBookmarks tags={["linux"]} />);

    const list = await screen.findByRole("list");
    expect(within(list).getAllByRole("link").map((a) => a.textContent)).toEqual(["Git in nuts", "Tmux tips"]);
    expect(within(screen.getByLabelText("Tags")).getAllByRole("link").map((a) => a.textContent)).toEqual([
      "linux x",
      "bash",
      "versioning",
    ]);
  });
});
