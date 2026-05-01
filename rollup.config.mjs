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

// Resolves any `./scheduler-shim` import to `./scheduler-shim-sync` so the
// resulting bundle drops scheduler.ts / work-loop.ts / lane plumbing and
// runs all updates synchronously. Used for the `dist/sync.*` outputs.
const syncShimAlias = {
  name: "tachys-sync-shim-alias",
  resolveId(source, importer) {
    if (source !== "./scheduler-shim") return null
    if (importer === undefined) return null
    return this.resolve("./scheduler-shim-sync", importer, { skipSelf: true })
  },
}

// Property names that are exclusively framework-internal:
// - never set/read by babel-plugin-tachys or compiler-core-tachys output
// - never asserted on by user-facing tests in `src/`
// - never appearing in the public type signatures
// Mangling these saves ~8% off the minified output because they appear
// hundreds of times each across component.ts / effects.ts / diff.ts.
//
// Anything that crosses the framework <-> compiled-template boundary
// (`_compare`, `_meta`, `patch`, `_e0..N`, `_t0..N`, `_ls0..N`,
// `_root`, `_html`, `_tachys`, `_tachysStopAt`, `_stack`, `_context`,
// `_defaultValue`, `_portalContainer`) is intentionally NOT in this
// list -- the babel plugin emits those names and the runtime reads
// them, so the writer and reader must agree on the literal name.
const internalPropPattern = /^_(hooks|effects|hookCount|passiveQueued|queuedLanes|rerender|contexts|mounted|rendered|parentDom|type|props|vnode)$/

const terserOpts = terser({
  compress: {
    passes: 2,
    unsafe_arrows: true,
    pure_getters: true,
    ecma: 2022,
  },
  mangle: {
    properties: {
      regex: internalPropPattern,
    },
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

const syncPlugins = [resolve({ extensions: [".ts", ".js"] }), syncShimAlias, swcPlugin]
const syncMinPlugins = [
  prodReplace,
  resolve({ extensions: [".ts", ".js"] }),
  syncShimAlias,
  swcPlugin,
  terserOpts,
]

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
  // --- Sync build (drops scheduler/work-loop/lane plumbing) ---
  {
    input: "src/index.ts",
    output: [
      {
        file: "dist/sync.js",
        format: "es",
        sourcemap: true,
      },
      {
        file: "dist/sync.cjs",
        format: "cjs",
        sourcemap: true,
        exports: "named",
      },
    ],
    plugins: syncPlugins,
  },
  {
    input: "src/index.ts",
    output: {
      file: "dist/sync.min.js",
      format: "es",
      sourcemap: true,
    },
    plugins: syncMinPlugins,
  },
  // --- sync-core: lean public surface for size-sensitive consumers ---
  {
    input: "src/sync-core.ts",
    output: [
      {
        file: "dist/sync-core.js",
        format: "es",
        sourcemap: true,
      },
      {
        file: "dist/sync-core.cjs",
        format: "cjs",
        sourcemap: true,
        exports: "named",
      },
    ],
    plugins: syncPlugins,
  },
  {
    input: "src/sync-core.ts",
    output: {
      file: "dist/sync-core.min.js",
      format: "es",
      sourcemap: true,
    },
    plugins: syncMinPlugins,
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
