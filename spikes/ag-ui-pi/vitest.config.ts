import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["test/**/*.int.test.ts", "test/**/*.unit.test.ts"],
    testTimeout: 15000,
  },
});
