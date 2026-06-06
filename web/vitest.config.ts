import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // DB tests run serially against one Postgres; no parallel file isolation needed.
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
