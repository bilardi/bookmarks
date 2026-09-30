// Writes everything of a person into a folder, for the Makefile to zip: the CSV
// files and the files of the person. Usage: npx tsx scripts/export.ts <email> <folder>
import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { buildExport } from "../src/exporting";
import { findProfileByEmail } from "../src/repository/profiles";

const [email, folder] = process.argv.slice(2);

// A few lines that lead to the project, where the deploy and the import are told.
const README = `Your bookmarks, exported from bookmarks: https://github.com/bilardi/bookmarks

The zip contains:
- bookmarks.csv: your bookmarks, in the format of the import
- files/: their files, where the column file of bookmarks.csv says
- my-notes-on-others.csv: your notes on what others shared, with its title; it is not imported

To load them into a bookmarks of your own: deploy it as docs/SETUP.md and
docs/DEPLOYMENT.md tell, then import them as docs/IMPORT.md tells, uploading
files/ under import/ and running make import CSV=bookmarks.csv.
`;
const bucket = process.env.CONTENT_BUCKET ?? "";
const s3 = new S3Client({});

const person = await findProfileByEmail(email ?? "");
if (!person) {
  console.error(`no profile for ${email}: nothing to export`);
  process.exit(1);
}

const result = await buildExport(person.userId);
await writeFile(join(folder, "bookmarks.csv"), result.bookmarks);
await writeFile(join(folder, "my-notes-on-others.csv"), result.notesOnOthers);
await writeFile(join(folder, "README.txt"), README);
for (const file of result.files) {
  const target = join(folder, "files", file.path);
  await mkdir(dirname(target), { recursive: true });
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: file.key }));
  await pipeline(res.Body as Readable, createWriteStream(target));
}
// The Makefile reads this line: the name of the archive in exports/.
console.log(person.userId);
