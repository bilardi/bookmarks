import { describe, expect, it } from "vitest";

import { S3Client } from "@aws-sdk/client-s3";

import { contentDisposition, s3Storage } from "../src/storage";

// Signing is computed locally: fake credentials are enough and nothing is sent.
const client = new S3Client({
  region: "eu-west-1",
  credentials: { accessKeyId: "fake", secretAccessKey: "fake" },
});
const storage = s3Storage("test-bucket", client);

describe("contentDisposition", () => {
  it("opens in the page what the browser can show, and downloads the rest", () => {
    expect(contentDisposition("l1.mp3", "audio/mpeg")).toBe("inline; filename*=UTF-8''l1.mp3");
    expect(contentDisposition("a.pdf", "application/pdf")).toBe("inline; filename*=UTF-8''a.pdf");
    expect(contentDisposition("a b.zip", "application/zip")).toBe("attachment; filename*=UTF-8''a%20b.zip");
  });
});

describe("s3Storage", () => {
  it("signs a download for an hour, with the name to give the file", async () => {
    const url = new URL(await storage.presignDownload("files/u/i", "l1.mp3", "audio/mpeg"));
    expect(url.hostname).toContain("test-bucket");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("3600");
    expect(url.searchParams.get("response-content-disposition")).toBe("inline; filename*=UTF-8''l1.mp3");
  });

  it("signs an upload with the key, the type and the storage class fixed", async () => {
    const upload = await storage.presignUpload("files/u/i", "audio/mpeg", 1000);
    expect(upload.url).toContain("test-bucket");
    expect(upload.fields.key).toBe("files/u/i");
    expect(upload.fields["Content-Type"]).toBe("audio/mpeg");
    expect(upload.fields["x-amz-storage-class"]).toBe("INTELLIGENT_TIERING");
    const policy = JSON.parse(Buffer.from(upload.fields.Policy, "base64").toString("utf8"));
    expect(policy.conditions).toContainEqual(["content-length-range", 1, 1000]);
  });
});
