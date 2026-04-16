import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    passWithNoTests: true,
    environment: "jsdom",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/jsx-types.ts",
        "src/dev.ts",
      ],
      reporter: ["text", "lcov", "json-summary"],
      reportsDirectory: "coverage",
    },
  },
  bench: {
    include: ["benchmarks/suites/**/*.bench.ts"],
    poolOptions: {
      threads: {
        execArgv: [],
      },
    },
  },
})
