import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  // Next.js compiles .tsx with the automatic JSX runtime (no `import
  // React` needed in any component file) — esbuild defaults to the
  // classic runtime, so component test files rendering real app
  // components need this to match, without touching every component file.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["tests/setup.ts"],
    // DB-backed tests share one SQLite file — keep test files serial to
    // avoid concurrent-write lock errors.
    fileParallelism: false,
    testTimeout: 20000
  }
});
