import type { UploadView } from "@bookmarks/core";

// What the operations need from S3, so that tests can stand in for it. The
// implementation on S3 is s3Storage, below.
export interface Storage {
  presignUpload(key: string, contentType: string, maxBytes: number): Promise<UploadView>;
  presignDownload(key: string, name: string, contentType: string): Promise<string>;
  deleteObject(key: string): Promise<void>;
}

// S3 checks the expiry of an upload only when the request starts, so fifteen
// minutes are enough. A download URL is reused by the browser for every range
// request of the same audio, so it has to outlast the listening: an hour covers a
// lesson of thirty minutes with a few pauses.
export const UPLOAD_EXPIRES_SECONDS = 900;
export const DOWNLOAD_EXPIRES_SECONDS = 3600;

const INLINE = /^(audio|video|image)\/|^application\/pdf$/;

// What the browser can show opens in the page, the rest is downloaded with its
// original name.
export function contentDisposition(name: string, contentType: string): string {
  const kind = INLINE.test(contentType) ? "inline" : "attachment";
  return `${kind}; filename*=UTF-8''${encodeURIComponent(name)}`;
}
