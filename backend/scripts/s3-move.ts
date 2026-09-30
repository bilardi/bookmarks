import { CopyObjectCommand, DeleteObjectCommand, HeadObjectCommand, type S3Client } from "@aws-sdk/client-s3";

// The type and the size S3 recorded for an object, or null when there is none.
export async function headObject(
  s3: S3Client,
  bucket: string,
  key: string,
): Promise<{ type: string; size: number } | null> {
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
export async function moveObject(s3: S3Client, bucket: string, fromKey: string, toKey: string): Promise<void> {
  const original = await headObject(s3, bucket, fromKey);
  if (original === null) throw new Error(`no ${fromKey}`);
  await s3.send(
    new CopyObjectCommand({
      Bucket: bucket,
      Key: toKey,
      CopySource: `${bucket}/${encodeURI(fromKey)}`,
      StorageClass: "INTELLIGENT_TIERING",
    }),
  );
  const copy = await headObject(s3, bucket, toKey);
  if (copy === null || copy.size !== original.size) throw new Error(`${fromKey} did not copy: the original stays`);
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: fromKey }));
}
