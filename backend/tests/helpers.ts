import { wipePerson } from "../src/repository/people";
import type { Caller } from "../src/http";

export function caller(userId: string, name = userId): Caller {
  return { userId, name, email: `${userId}@test` };
}

export async function wipeUsers(userIds: string[]): Promise<void> {
  for (const userId of userIds) await wipePerson(userId);
}
