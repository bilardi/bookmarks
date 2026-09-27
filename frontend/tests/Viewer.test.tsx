import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Viewer, viewerKind } from "../src/components/Viewer";
import { item } from "./items";

afterEach(() => {
  vi.restoreAllMocks();
});

const AUDIO = item({ file: { name: "l1.mp3", size: 10, contentType: "audio/mpeg", status: "ready" } });

describe("viewerKind", () => {
  it("opens in the page what the browser can show, and downloads the rest", () => {
    expect(viewerKind("audio/mpeg")).toBe("audio");
    expect(viewerKind("video/mp4")).toBe("video");
    expect(viewerKind("application/pdf")).toBe("pdf");
    expect(viewerKind("image/png")).toBe("image");
    expect(viewerKind("application/zip")).toBe("download");
  });
});

describe("Viewer", () => {
  it("asks for a new address when the old one fails, and only once", async () => {
    let n = 0;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      n += 1;
      return new Response(JSON.stringify({ url: `https://s3/l1.mp3?v=${n}` }), { status: 200 });
    });
    const { container } = render(<Viewer item={AUDIO} onClose={() => undefined} />);

    await waitFor(() => expect(container.querySelector("audio")?.getAttribute("src")).toBe("https://s3/l1.mp3?v=1"));
    fireEvent.error(container.querySelector("audio")!);
    await waitFor(() => expect(container.querySelector("audio")?.getAttribute("src")).toBe("https://s3/l1.mp3?v=2"));
    fireEvent.error(container.querySelector("audio")!);

    expect((await screen.findByRole("alert")).textContent).toBe("The file cannot be played");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
