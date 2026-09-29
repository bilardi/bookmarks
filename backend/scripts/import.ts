// Loads bookmarks from a CSV file as the curator, as docs/IMPORT.md describes. Run
// from the Makefile, which hands it the table, the bucket and the curator.
// Usage: npx tsx scripts/import.ts <file.csv>
import { readFile } from "node:fs/promises";

import { CopyObjectCommand, DeleteObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { readImport, runImport, type ImportStore } from "../src/importing";

const bucket = process.env.CONTENT_BUCKET ?? "";
const s3 = new S3Client({});

async function head(key: string): Promise<{ type: string; size: number } | null> {
  try {
    const res = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { type: res.ContentType ?? "application/octet-stream", size: res.ContentLength ?? -1 };
  } catch (err) {
    if ((err as { name?: string }).name === "NotFound") return null;
    throw err;
  }
}

// The copy stays inside S3, and lands in the class every upload of the pages
// uses. The original goes only once the copy is there with its size: a file is
// never paid for twice, and never lost.
const store: ImportStore = {
  contentTypeOf: async (source) => (await head(`import/${source}`))?.type ?? null,
  exists: async (key) => (await head(key)) !== null,
  move: async (source, key) => {
    const original = await head(`import/${source}`);
    if (original === null) throw new Error(`no import/${source}`);
    await s3.send(
      new CopyObjectCommand({
        Bucket: bucket,
        Key: key,
        CopySource: `${bucket}/${encodeURI(`import/${source}`)}`,
        StorageClass: "INTELLIGENT_TIERING",
      }),
    );
    const copy = await head(key);
    if (copy === null || copy.size !== original.size) throw new Error(`import/${source} did not copy: the original stays`);
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: `import/${source}` }));
  },
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
