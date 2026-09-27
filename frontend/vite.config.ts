import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
// defineConfig comes from vitest/config: it is the one whose type includes `test`.
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@bookmarks/core": fileURLToPath(new URL("../core/src/index.ts", import.meta.url)),
    },
  },
  // Local dev server proxy to make sam-local, as CloudFront does on AWS.
  server: {
    proxy: { "/api": { target: "http://127.0.0.1:3000", rewrite: (p) => p.replace(/^\/api/, "") } },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
});
