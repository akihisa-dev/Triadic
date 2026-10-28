import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { bundledNotices } from "./scripts/bundled-notices";
import { isBuildOutput } from "./scripts/build-watch";
const notices = bundledNotices();

const projectRoot = process.cwd();
const buildOutputRoot = process.env.TRIADIC_BUILD_OUTPUT
  ? path.resolve(process.env.TRIADIC_BUILD_OUTPUT)
  : path.resolve(projectRoot, "dist", "vite");

export default defineConfig({
  root: projectRoot,
  base: "./",
  server: { watch: { ignored: (file: string) => isBuildOutput(file, projectRoot) } },
  // Preserve embedded whitespace as escaped strings in distribution files.
  esbuild: { supported: { "template-literal": false } },
  plugins: [react(), notices.main()],
  worker: { format: "es", plugins: () => [notices.worker()] },
  optimizeDeps: { exclude: ["@sqlite.org/sqlite-wasm"] },
  build: {
    outDir: buildOutputRoot,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: path.resolve(projectRoot, "index.html"),
        background: path.resolve(
          projectRoot,
          "Triadic-extension",
          "src",
          "extension",
          "background.ts",
        ),
      },
      output: {
        entryFileNames: (chunkInfo) =>
          chunkInfo.name === "background"
            ? "src/extension/background.js"
            : "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
