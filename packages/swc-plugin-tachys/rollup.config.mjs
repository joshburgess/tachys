import resolve from "@rollup/plugin-node-resolve"
import { swc } from "rollup-plugin-swc3"

const swcPlugin = swc({
  jsc: {
    parser: { syntax: "typescript" },
    target: "es2022",
    loose: true,
  },
  sourceMaps: true,
})

const external = ["@swc/core", "@swc/types", "compiler-core-tachys"]

export default {
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
  external,
  plugins: [resolve({ extensions: [".ts", ".js"] }), swcPlugin],
}
