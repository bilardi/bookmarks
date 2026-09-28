import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TagBar } from "../src/components/TagBar";

const connections = new Map([["lessons", 4], ["english", 3], ["aws", 5], ["alone", 1]]);

describe("TagBar", () => {
  it("orders the tags from the most connected, with the tone of each", () => {
    render(<TagBar selected={[]} available={["alone", "english", "lessons", "aws"]} connections={connections} pathOf={() => "/"} />);
    const links = within(screen.getByLabelText("Tags")).getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual(["aws", "lessons", "english", "alone"]);
    expect(links.map((a) => a.className)).toEqual(["tag tone-5", "tag tone-4", "tag tone-3", "tag tone-1"]);
  });

  it("keeps the tone of a tag when the bar narrows", () => {
    render(<TagBar selected={["lessons"]} available={["english"]} connections={connections} pathOf={() => "/"} />);
    const links = within(screen.getByLabelText("Tags")).getAllByRole("link");
    expect(links.map((a) => [a.textContent, a.className])).toEqual([
      ["lessons x", "tag selected"],
      ["english", "tag tone-3"],
    ]);
  });
});
