import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // DB-backed tests share one SQLite file — keep test files serial to
    // avoid concurrent-write lock errors.
    fileParallelism: false,
    testTimeout: 20000
  }
});
