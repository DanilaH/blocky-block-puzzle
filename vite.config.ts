import { defineConfig } from "vitest/config";
export default defineConfig({
  base: "./",
  test: { include: ["tests/**/*.test.ts"] },
  build: {
    rollupOptions: {
      input: { main: "index.html", clearBenchmark: "diagnostics/clear.html" },
      output: {
        manualChunks: (id: string) =>
          id.includes("node_modules/phaser") ? "phaser" : undefined,
      },
    },
  },
});
