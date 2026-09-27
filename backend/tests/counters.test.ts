import { describe, expect, it } from "vitest";

import { counterDeltas, sharedDelta } from "../src/counters";

describe("counterDeltas", () => {
  it("adds one to every folder above a new item and to its tags", () => {
    const deltas = counterDeltas(undefined, { path: "lessons/english", tags: ["lessons"], shared: true });
    expect(Object.fromEntries(deltas)).toEqual({
      "FOLDER#": { items: 1, shared: 1 },
      "FOLDER#lessons": { items: 1, shared: 1 },
      "FOLDER#lessons/english": { items: 1, shared: 1 },
      "TAG#lessons": { items: 1, shared: 1 },
    });
  });

  it("moves only what changes, and drops the keys that do not", () => {
    const deltas = counterDeltas(
      { path: "lessons/english", tags: ["lessons", "english"], shared: true },
      { path: "lessons/spanish", tags: ["lessons", "spanish"], shared: true },
    );
    expect(Object.fromEntries(deltas)).toEqual({
      "FOLDER#lessons/english": { items: -1, shared: -1 },
      "FOLDER#lessons/spanish": { items: 1, shared: 1 },
      "TAG#english": { items: -1, shared: -1 },
      "TAG#spanish": { items: 1, shared: 1 },
    });
  });

  it("changes only the shared counters when sharing flips", () => {
    const deltas = counterDeltas(
      { path: "", tags: ["a"], shared: false },
      { path: "", tags: ["a"], shared: true },
    );
    expect(Object.fromEntries(deltas)).toEqual({
      "FOLDER#": { items: 0, shared: 1 },
      "TAG#a": { items: 0, shared: 1 },
    });
  });
});

describe("sharedDelta", () => {
  it("is the change of the shared flag", () => {
    expect(sharedDelta(undefined, { path: "", tags: [], shared: true })).toBe(1);
    expect(sharedDelta({ path: "", tags: [], shared: true }, undefined)).toBe(-1);
    expect(sharedDelta({ path: "", tags: [], shared: true }, { path: "x", tags: [], shared: true })).toBe(0);
  });
});
