# swc-plugin-tachys

SWC-based JSX compiler for Tachys. Produces the same compiled output as [`babel-plugin-tachys`](https://github.com/joshburgess/tachys/tree/main/packages/babel-plugin-tachys), but parses via `@swc/core` so SWC-based toolchains (Vite, Next.js, Bun) can use the Tachys fast path without bringing in Babel.

This is a plain async `transform(source)` function, not a real SWC Rust/WASM plugin. Pair it with whatever transform pipeline your bundler exposes.

## Install

```bash
pnpm add -D swc-plugin-tachys
```

Requires `@swc/core ^1.9.0` as a peer.

## Usage

```ts
import { transform } from "swc-plugin-tachys"

const { code, compiled } = await transform(source, { filename: "App.tsx" })
// `compiled` = number of function declarations rewritten into markCompiled form.
```

`filename` is used for diagnostics and to pick the parser (`.ts`/`.tsx` go through the TypeScript parser with `tsx` enabled when appropriate; everything else uses ECMAScript with JSX on).

The plugin only rewrites function declarations whose name starts with an uppercase letter and whose body matches the supported shape. Components that don't compile are left untouched, so adoption is incremental.

## What gets compiled

```js
// Input
function Counter({ count }) {
  return <button>{count}</button>
}

// Output (illustrative)
import { markCompiled, _template } from "tachys/compiled"
const _tpl$Counter_0 = _template("<button></button>")
const Counter = markCompiled(/* mount */, /* patch */, /* compare */)
```

The runtime then clones the template and runs the generated `patch` function on prop changes, with no diffing.

## License

Dual-licensed under MIT or Apache-2.0, at your option.
