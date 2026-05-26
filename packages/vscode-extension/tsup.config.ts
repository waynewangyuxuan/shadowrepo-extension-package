import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/extension.ts"],
  format: ["cjs"],
  outDir: "dist",
  target: "node20",
  external: ["vscode"],
  noExternal: ["@shadowrepo/shared"],
  sourcemap: true,
  clean: true,
});
