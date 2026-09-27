import { build } from "esbuild";

const functions = ["items", "files", "views", "file-events"] as const;

// Bundle each Lambda entry into its own CJS file. The clients and lib-dynamodb are
// provided by the nodejs22.x runtime, so they stay external; the two presigners
// are bundled, because being in the runtime is not something to count on for them.
await Promise.all(
  functions.map((fn) =>
    build({
      entryPoints: [`src/lambda/${fn}.ts`],
      outfile: `dist/lambda/${fn}/index.js`,
      bundle: true,
      platform: "node",
      target: "node22",
      format: "cjs",
      external: ["@aws-sdk/client-*", "@aws-sdk/lib-dynamodb"],
      logLevel: "info",
    }),
  ),
);

console.log("built lambdas:", functions.join(", "));
