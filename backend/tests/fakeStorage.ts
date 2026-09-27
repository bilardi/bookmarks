import type { Storage } from "../src/storage";

// S3 stands aside in these tests: the signing is checked on its own, and the
// operations only need to know what they asked for.
export function fakeStorage(): Storage & { deleted: string[] } {
  const deleted: string[] = [];
  return {
    deleted,
    async presignUpload(key, contentType, maxBytes) {
      return { url: "https://upload.test/", fields: { key, "Content-Type": contentType, max: String(maxBytes) } };
    },
    async presignDownload(key, name) {
      return `https://download.test/${key}?name=${encodeURIComponent(name)}`;
    },
    async deleteObject(key) {
      deleted.push(key);
    },
  };
}
