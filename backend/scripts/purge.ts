// Shows the shared items of a person, or deletes everything of them, passing the
// shared items to the curator when asked. Run from the Makefile, which checks first
// that the person is banned, and asks. Usage: npx tsx scripts/purge.ts preview <email>
//                                             npx tsx scripts/purge.ts run <email> [keep-shared]
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

import { previewShared, purgePerson, type PurgeStore } from "../src/purging";
import { removeInvite } from "../src/repository/invites";
import { findProfileByEmail } from "../src/repository/profiles";
import { moveObject } from "./s3-move";

const [mode, email, keep] = process.argv.slice(2);
const bucket = process.env.CONTENT_BUCKET ?? "";
const s3 = new S3Client({});

const store: PurgeStore = {
  move: (fromKey, toKey) => moveObject(s3, bucket, fromKey, toKey),
  removePrefix: async (prefix) => {
    let removed = 0;
    let token: string | undefined;
    do {
      const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
      const keys = (page.Contents ?? []).map((o) => ({ Key: o.Key as string }));
      if (keys.length > 0) await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys } }));
      removed += keys.length;
      token = page.NextContinuationToken;
    } while (token);
    return removed;
  },
};

const person = await findProfileByEmail(email ?? "");
if (!person) {
  console.error(`no profile for ${email}: nothing to purge`);
  process.exit(1);
}
// The first line is the count, which the Makefile reads; the list is for the curator.
if (mode === "preview") {
  const { count, csv } = await previewShared(person.userId);
  console.log(count);
  process.stdout.write(csv);
  process.exit(0);
}
if (mode !== "run") {
  console.error("usage: purge.ts preview <email> | run <email> [keep-shared]");
  process.exit(1);
}

const curator = keep === "keep-shared"
  ? { userId: process.env.CURATOR_SUB ?? "", name: "", email: (process.env.CURATOR_EMAIL ?? "").toLowerCase() }
  : undefined;
const result = await purgePerson(person, store, curator);
await removeInvite(person.email);
console.log(`deleted ${result.deleted} items and ${result.files} files, passed ${result.kept} to the curator`);
console.log(person.userId);
