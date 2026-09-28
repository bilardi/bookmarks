import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/App";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App", () => {
  it("offers the own bookmarks, the shared ones and the usage", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no api in tests"));
    render(<App />);

    const nav = await screen.findByRole("navigation", { name: "Sections" });
    expect(within(nav).getAllByRole("link").map((a) => a.textContent)).toEqual(["My bookmarks", "Shared", "Usage"]);
  });

  it("tells every person who can read the bookmarks", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no api in tests"));
    render(<App />);

    expect(await screen.findByText(/The curator of this site can read the bookmarks of everybody/)).toBeTruthy();
  });
});
