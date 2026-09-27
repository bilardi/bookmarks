import type { ItemView } from "@bookmarks/core";

export function item(overrides: Partial<ItemView> = {}): ItemView {
  return {
    id: "i1",
    owner: "u1",
    title: "Lesson 1",
    path: "",
    position: 1,
    tags: [],
    shared: false,
    createdAt: "2026-09-27T00:00:00.000Z",
    updatedAt: "2026-09-27T00:00:00.000Z",
    view: { seen: false, flag: false, note: "" },
    ...overrides,
  };
}
