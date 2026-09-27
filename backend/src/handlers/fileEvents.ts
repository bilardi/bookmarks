import type { S3Event } from "aws-lambda";

import { fileCreated } from "../operations/files";

// S3 encodes the key in the event like a form field: "+" for a space.
function keyOf(raw: string): string {
  return decodeURIComponent(raw.replace(/\+/g, " "));
}

export async function fileEvents(event: S3Event): Promise<void> {
  for (const record of event.Records) {
    await fileCreated(keyOf(record.s3.object.key), record.s3.object.size);
  }
}
