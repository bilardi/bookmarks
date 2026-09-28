import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Usage } from "../src/pages/Usage";
import { mockApi } from "./fetchMock";

afterEach(() => {
  vi.restoreAllMocks();
});

const MONTH = { month: "2026-09", getCount: 1000, getBytes: 1024 ** 3, putCount: 2, putBytes: 2048 };

describe("Usage", () => {
  it("shows bytes and costs, with the day the prices were read", async () => {
    mockApi({
      "GET /api/me/usage": {
        months: [{ ...MONTH, cost: 0.0954 }],
        storedBytes: 2048,
        storageCost: 0.00001,
        pricesDate: "2026-09-27",
      },
    });
    render(<Usage />);

    const cells = (await screen.findAllByRole("cell")).map((c) => c.textContent);
    expect(cells).toEqual(["2026-09", "1000", "1.0 GB", "2", "2.0 KB", "$0.0954"]);
    expect(screen.getByText(/read on 2026-09-27/)).toBeTruthy();
  });

  it("says there is no traffic yet instead of an empty table", async () => {
    mockApi({ "GET /api/me/usage": { months: [], storedBytes: 0 } });
    render(<Usage />);

    expect(await screen.findByText("No traffic yet.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("leaves the costs empty, not zero, when no prices were configured", async () => {
    mockApi({ "GET /api/me/usage": { months: [MONTH], storedBytes: 0 } });
    render(<Usage />);

    const cells = (await screen.findAllByRole("cell")).map((c) => c.textContent);
    expect(cells[5]).toBe("");
    expect(screen.getByText(/once the deploy has read the prices/)).toBeTruthy();
  });
});
