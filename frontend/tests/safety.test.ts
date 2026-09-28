// @vitest-environment node
// It reads files and needs no page: in Node, import.meta.url is the path of this
// file, while in the simulated browser of the other tests it is not.
import { describe, expect, it } from "vitest";

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const SOURCES = files(new URL("../src", import.meta.url).pathname);

// The bookmarks are private, and a text shared by somebody else must never become
// code in the page. React inserts every text as text; these are the ways around it.
describe("the pages", () => {
  // A check that reads no file would pass for nothing.
  it("reads the sources of the pages", () => {
    expect(SOURCES.some((file) => file.endsWith("App.tsx"))).toBe(true);
  });

  it("never insert HTML taken from the data", () => {
    for (const file of SOURCES) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(
        /dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|document\.write/,
      );
    }
  });

  it("never run code built while they run", () => {
    for (const file of SOURCES) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/\beval\(|new Function\(/);
    }
  });
});
