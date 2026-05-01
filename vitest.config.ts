import { defineConfig } from "vitest/config"

export default defineConfig({
  // Build-time feature flags. Production builds replace these via
  // @rollup/plugin-replace; vitest runs the full surface so all flags
  // are `true` here.
  define: {
    __SUPPORTS_ERROR_BOUNDARY__: "true",
    __SUPPORTS_SUSPENSE__: "true",
    __SUPPORTS_PORTAL__: "true",
    __SUPPORTS_CONTEXT__: "true",
  },
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
