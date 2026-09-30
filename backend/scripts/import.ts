// Loads bookmarks from a CSV file as the curator, as docs/IMPORT.md describes. Run
// from the Makefile, which hands it the table, the bucket and the curator.
// Usage: npx tsx scripts/import.ts <file.csv>
import { readFile } from "node:fs/promises";

import { S3Client } from "@aws-sdk/client-s3";

import { readImport, runImport, type ImportStore } from "../src/importing";
import { headObject, moveObject } from "./s3-move";

const bucket = process.env.CONTENT_BUCKET ?? "";
const s3 = new S3Client({});

const store: ImportStore = {
  contentTypeOf: async (source) => (await headObject(s3, bucket, `import/${source}`))?.type ?? null,
  exists: async (key) => (await headObject(s3, bucket, key)) !== null,
  move: (source, key) => moveObject(s3, bucket, `import/${source}`, key),
};

const curator = {
  userId: process.env.CURATOR_SUB ?? "",
  name: process.env.CURATOR_EMAIL ?? "",
  email: (process.env.CURATOR_EMAIL ?? "").toLowerCase(),
};
const plan = readImport(await readFile(process.argv[2] ?? "", "utf8"));
const result = await runImport(curator, plan, store);
if (result.problems.length > 0) {
  for (const problem of result.problems) console.error(problem);
  console.error("nothing was created");
  process.exit(1);
}
console.log(`created ${result.created}, skipped ${result.skipped}`);
