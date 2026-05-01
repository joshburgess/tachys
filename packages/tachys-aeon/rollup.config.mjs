import resolve from "@rollup/plugin-node-resolve"
import { swc } from "rollup-plugin-swc3"

const swcPlugin = swc({
  jsc: {
    parser: { syntax: "typescript", tsx: true },
    target: "es2022",
    loose: true,
  },
  sourceMaps: true,
})

const external = ["tachys", "aeon-core", "aeon-types", "aeon-scheduler"]

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
