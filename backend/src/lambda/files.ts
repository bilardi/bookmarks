import { makeFiles } from "../handlers/files";
import { s3Storage } from "../storage";

const MB = 1024 * 1024;

export const handler = makeFiles(
  s3Storage(process.env.CONTENT_BUCKET ?? ""),
  Number(process.env.MAX_FILE_SIZE_MB ?? "200") * MB,
);
