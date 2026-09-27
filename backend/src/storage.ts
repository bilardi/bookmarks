import { DeleteObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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

// Every upload lands in Intelligent-Tiering: a file nobody opens moves by itself to
// the cheaper tiers, with no charge to bring it back.
export function s3Storage(bucket: string, client: S3Client = new S3Client({})): Storage {
  return {
    async presignUpload(key, contentType, maxBytes) {
      const { url, fields } = await createPresignedPost(client, {
        Bucket: bucket,
        Key: key,
        Conditions: [
          ["content-length-range", 1, maxBytes],
          ["eq", "$Content-Type", contentType],
          ["eq", "$x-amz-storage-class", "INTELLIGENT_TIERING"],
        ],
        Fields: { "Content-Type": contentType, "x-amz-storage-class": "INTELLIGENT_TIERING" },
        Expires: UPLOAD_EXPIRES_SECONDS,
      });
      return { url, fields };
    },
    async presignDownload(key, name, contentType) {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentDisposition: contentDisposition(name, contentType),
        ResponseContentType: contentType,
      });
      return getSignedUrl(client, command, { expiresIn: DOWNLOAD_EXPIRES_SECONDS });
    },
    async deleteObject(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}
