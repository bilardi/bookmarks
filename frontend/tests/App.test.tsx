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

  it("shows the public bookmarks without starting a login", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    window.history.replaceState({}, "", "/public");
    render(<App />);

    expect(await screen.findByRole("button", { name: "Log in" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Sections" })).toBeNull();
    window.history.replaceState({}, "", "/");
  });
});
