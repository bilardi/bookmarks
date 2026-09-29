import { beforeEach, describe, expect, it } from "vitest";

import { addInvite, isInvited, removeInvite } from "../src/repository/invites";
import { addStoredBytes, registerProfile } from "../src/repository/profiles";
import { addUsage, listEveryUsage } from "../src/repository/usage";
import { caller, wipeUsers } from "./helpers";

const A = caller("repo-curator-a", "Ada");
const EMAIL = "Repo-Curator@Test";

beforeEach(async () => {
  await wipeUsers([A.userId]);
  await removeInvite(EMAIL);
});

describe("invitations", () => {
  it("invites an address whatever its case, and takes the invitation back", async () => {
    await addInvite(EMAIL);
    expect(await isInvited("repo-curator@test")).toBe(true);
    expect(await removeInvite("REPO-CURATOR@TEST")).toBe(true);
    expect(await isInvited("repo-curator@test")).toBe(false);
  });

  it("says when there was no invitation to take back", async () => {
    expect(await removeInvite(EMAIL)).toBe(false);
  });
});

describe("listEveryUsage", () => {
  it("gives every person with their months, the most recent first, and the bytes they keep", async () => {
    await registerProfile(A);
    await addStoredBytes(A.userId, 2048);
    await addUsage(A.userId, "2026-08", { getCount: 1, getBytes: 100 });
    await addUsage(A.userId, "2026-09", { putCount: 2, putBytes: 300 });

    const ada = (await listEveryUsage()).find((p) => p.userId === A.userId);
    expect(ada).toEqual({
      userId: A.userId,
      name: "Ada",
      email: A.email,
      storedBytes: 2048,
      months: [
        { month: "2026-09", getCount: 0, getBytes: 0, putCount: 2, putBytes: 300 },
        { month: "2026-08", getCount: 1, getBytes: 100, putCount: 0, putBytes: 0 },
      ],
    });
  });
});
