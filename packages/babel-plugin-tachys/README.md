# babel-plugin-tachys

Babel plugin that compiles Tachys JSX function components into `markCompiled` + `_template` form, skipping the VDOM entirely at runtime for the compiled subtree.

The plugin walks each top-level `FunctionDeclaration`, decides whether the body is statically compilable, and rewrites it into a `markCompiled(mount, patch, compare)` call plus a hoisted `_template(...)` declaration. The Tachys runtime then clones the template and runs the generated `patch` function on prop changes, with no diffing.

Pairs with the SWC frontend [`swc-plugin-tachys`](https://github.com/joshburgess/tachys/tree/main/packages/swc-plugin-tachys) (same IR, same emitter).

## Install

```bash
pnpm add -D babel-plugin-tachys
```

Requires `@babel/core ^7.20.0` as a peer.

## Usage

In `babel.config.js`:

```js
export default {
  plugins: [
    "babel-plugin-tachys",
    // ...your other plugins
  ],
}
```

The plugin only rewrites function declarations whose name starts with an uppercase letter and whose body fits the supported JSX shape. Anything else is left untouched, so you can adopt it incrementally.

## What gets compiled

The plugin produces output that imports from `tachys/compiled`:

```js
import { markCompiled, _template, _patchList } from "tachys/compiled"

const _tpl$Counter_0 = _template("<button></button>")

const Counter = markCompiled(
  /* mount  */ (props) => /* clones _tpl$Counter_0 and wires events */,
  /* patch  */ (el, prev, next) => /* updates only the bound slots */,
  /* compare */ (prev, next) => prev.count === next.count,
)
```

Components that the plugin can't compile (dynamic patterns, unsupported expressions) fall back to the regular Tachys VDOM path.

## License

Dual-licensed under MIT or Apache-2.0, at your option.
