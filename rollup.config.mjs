import resolve from "@rollup/plugin-node-resolve"
import replace from "@rollup/plugin-replace"
import terser from "@rollup/plugin-terser"
import { swc } from "rollup-plugin-swc3"

const swcPlugin = swc({
  jsc: {
    parser: {
      syntax: "typescript",
      tsx: true,
      decorators: false,
    },
    transform: {
      react: {
        pragma: "h",
        pragmaFrag: "Fragment",
      },
    },
    target: "es2022",
    loose: true,
    keepClassNames: true,
    assumptions: {
      noClassCalls: true,
      setPublicClassFields: true,
      ignoreFunctionLength: true,
      ignoreFunctionName: true,
    },
  },
  sourceMaps: true,
})

const plugins = [resolve({ extensions: [".ts", ".js"] }), swcPlugin]

const terserOpts = terser({
  compress: {
    passes: 2,
    unsafe_arrows: true,
    pure_getters: true,
    ecma: 2022,
  },
  mangle: {
    properties: false,
  },
  format: {
    comments: false,
    ecma: 2022,
  },
})

const prodReplace = replace({
  preventAssignment: true,
  values: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
})

const minPlugins = [prodReplace, resolve({ extensions: [".ts", ".js"] }), swcPlugin, terserOpts]

const benchPlugins = [
  replace({
    preventAssignment: true,
    values: {
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
  }),
  resolve({ extensions: [".ts", ".js"] }),
  swcPlugin,
]

export default [
  {
    input: "src/index.ts",
    output: [
      {
        file: "dist/index.js",
        format: "es",
        sourcemap: true,
      },
      {
        file: "dist/index.cjs",
        format: "cjs",
        sourcemap: true,
        exports: "named",
      },
    ],
    plugins,
  },
  {
    input: "src/jsx-runtime.ts",
    output: [
      {
        file: "dist/jsx-runtime.js",
        format: "es",
        sourcemap: true,
      },
      {
        file: "dist/jsx-runtime.cjs",
        format: "cjs",
        sourcemap: true,
        exports: "named",
      },
    ],
    plugins,
  },
  {
    input: "src/jsx-dev-runtime.ts",
    output: [
      {
        file: "dist/jsx-dev-runtime.js",
        format: "es",
        sourcemap: true,
      },
      {
        file: "dist/jsx-dev-runtime.cjs",
        format: "cjs",
        sourcemap: true,
        exports: "named",
      },
    ],
    plugins,
  },
  {
    input: "src/compat.ts",
    output: [
      {
        file: "dist/compat.js",
        format: "es",
        sourcemap: true,
      },
      {
        file: "dist/compat.cjs",
        format: "cjs",
        sourcemap: true,
        exports: "named",
      },
    ],
    plugins,
  },
  {
    input: "src/server.ts",
    output: [
      {
        file: "dist/server.js",
        format: "es",
        sourcemap: true,
      },
      {
        file: "dist/server.cjs",
        format: "cjs",
        sourcemap: true,
        exports: "named",
      },
    ],
    plugins,
  },
  {
    input: "src/tags.ts",
    output: [
      {
        file: "dist/tags.js",
        format: "es",
        sourcemap: true,
      },
      {
        file: "dist/tags.cjs",
        format: "cjs",
        sourcemap: true,
        exports: "named",
      },
    ],
    plugins,
  },
  {
    input: "src/compiled.ts",
    output: [
      {
        file: "dist/compiled.js",
        format: "es",
        sourcemap: true,
      },
      {
        file: "dist/compiled.cjs",
        format: "cjs",
        sourcemap: true,
        exports: "named",
      },
    ],
    plugins,
  },
  {
    input: "src/hydrate-root.ts",
    output: [
      {
        file: "dist/hydrate.js",
        format: "es",
        sourcemap: true,
      },
      {
        file: "dist/hydrate.cjs",
        format: "cjs",
        sourcemap: true,
        exports: "named",
      },
    ],
    plugins,
  },
  // --- Minified builds ---
  {
    input: "src/index.ts",
    output: {
      file: "dist/index.min.js",
      format: "es",
      sourcemap: true,
    },
    plugins: minPlugins,
  },
  {
    input: "src/jsx-runtime.ts",
    output: {
      file: "dist/jsx-runtime.min.js",
      format: "es",
      sourcemap: true,
    },
    plugins: minPlugins,
  },
  {
    input: "src/jsx-dev-runtime.ts",
    output: {
      file: "dist/jsx-dev-runtime.min.js",
      format: "es",
      sourcemap: true,
    },
    plugins: minPlugins,
  },
  {
    input: "src/compat.ts",
    output: {
      file: "dist/compat.min.js",
      format: "es",
      sourcemap: true,
    },
    plugins: minPlugins,
  },
  {
    input: "src/server.ts",
    output: {
      file: "dist/server.min.js",
      format: "es",
      sourcemap: true,
    },
    plugins: minPlugins,
  },
  {
    input: "src/tags.ts",
    output: {
      file: "dist/tags.min.js",
      format: "es",
      sourcemap: true,
    },
    plugins: minPlugins,
  },
  {
    input: "src/compiled.ts",
    output: {
      file: "dist/compiled.min.js",
      format: "es",
      sourcemap: true,
    },
    plugins: minPlugins,
  },
  {
    input: "src/hydrate-root.ts",
    output: {
      file: "dist/hydrate.min.js",
      format: "es",
      sourcemap: true,
    },
    plugins: minPlugins,
  },
  {
    input: "benchmarks/browser/inferno-bench-entry.js",
    output: {
      file: "benchmarks/browser/inferno-bench-bundle.js",
      format: "es",
      sourcemap: false,
    },
    plugins: benchPlugins,
  },
]
