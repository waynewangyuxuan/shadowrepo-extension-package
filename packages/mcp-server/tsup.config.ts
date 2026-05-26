import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  shims: true,
  sourcemap: true,
  // Bundle @shadowrepo/shared since it's a workspace package (won't be resolvable post-link).
  noExternal: ["@shadowrepo/shared"],
});
