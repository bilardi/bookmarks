import { makeItems } from "../handlers/items";
import { s3Storage } from "../storage";

export const handler = makeItems(s3Storage(process.env.CONTENT_BUCKET ?? ""));
