import { beforeEach, describe, expect, it } from "vitest";

import {
  addStoredBytes,
  getProfileRecord,
  listOwners,
  registerProfile,
  syncOwnerIndex,
} from "../src/repository/profiles";
import { addUsage, currentMonth, listUsage } from "../src/repository/usage";
import { getViews, putView } from "../src/repository/views";
import { ensureFolders, getFolder, listFolders } from "../src/repository/folders";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { doc, TABLE_NAME } from "../src/dynamo";
import { PROFILE_SK, userPk } from "../src/keys";
import { caller, wipeUsers } from "./helpers";

const A = caller("repo-a", "Ada");

beforeEach(async () => {
  await wipeUsers([A.userId]);
});

describe("profiles", () => {
  it("registers a profile with zero counters, and keeps the counters on a second call", async () => {
    await registerProfile(A);
    await addStoredBytes(A.userId, 10);
    await registerProfile(A);
    expect(await getProfileRecord(A.userId)).toEqual({
      userId: A.userId,
      name: "Ada",
      email: A.email,
      sharedCount: 0,
      storedBytes: 10,
    });
  });

  it("lists as owner only who shares something", async () => {
    await registerProfile(A);
    await syncOwnerIndex(A.userId);
    expect((await listOwners()).some((o) => o.userId === A.userId)).toBe(false);

    await doc.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { pk: userPk(A.userId), sk: PROFILE_SK },
        UpdateExpression: "ADD sharedCount :one",
        ExpressionAttributeValues: { ":one": 1 },
      }),
    );
    await syncOwnerIndex(A.userId);
    expect(await listOwners()).toContainEqual({ userId: A.userId, name: "Ada" });
  });
});

describe("usage", () => {
  it("adds to the counters of the month", async () => {
    await addUsage(A.userId, "2026-09", { getCount: 1, getBytes: 100 });
    await addUsage(A.userId, "2026-09", { getCount: 1, putCount: 1, putBytes: 50 });
    expect(await listUsage(A.userId)).toEqual([
      { month: "2026-09", getCount: 2, getBytes: 100, putCount: 1, putBytes: 50 },
    ]);
  });

  it("names the month in UTC", () => {
    expect(currentMonth(new Date("2026-09-30T23:30:00-02:00"))).toBe("2026-10");
  });
});

describe("views", () => {
  it("returns only the views that exist", async () => {
    await putView(A.userId, "item-1", { seen: true, flag: false, note: "ok" });
    const views = await getViews(A.userId, ["item-1", "item-2"]);
    expect(views.get("item-1")).toEqual({ seen: true, flag: false, note: "ok" });
    expect(views.has("item-2")).toBe(false);
  });
});

describe("folders", () => {
  it("creates missing folders with zero counters and keeps existing counters", async () => {
    await ensureFolders(A.userId, ["", "lessons"]);
    await ensureFolders(A.userId, ["lessons"]);
    expect(await getFolder(A.userId, "lessons")).toEqual({ path: "lessons", itemCount: 0, sharedCount: 0 });
    expect((await listFolders(A.userId)).map((f) => f.path)).toEqual(["", "lessons"]);
  });
});
