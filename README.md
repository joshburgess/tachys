# Phasm

A high-performance virtual DOM library optimized for V8. Designed to match or exceed [Inferno](https://github.com/infernojs/inferno) on reconciliation speed while providing a modern React-like hooks API.

**4.5 KB** min+gzip. Zero dependencies.

## Features

- Inferno-style LIS keyed diffing algorithm
- V8-optimized: monomorphic call sites, stable hidden classes, SMI-friendly flags, object pooling
- Full hooks API: `useState`, `useReducer`, `useEffect`, `useLayoutEffect`, `useMemo`, `useCallback`, `useRef`, `useSyncExternalStore`
- `memo()`, `forwardRef()`, `createPortal()`, `ErrorBoundary`
- Context API with `createContext` / `useContext`
- Automatic JSX transform (`jsx-runtime`) and classic `h()` pragma
- Dual ESM/CJS output with full TypeScript declarations
- Development-mode warnings (duplicate keys, hook order violations) stripped in production

## Install

```bash
npm install phasm
```

## Quick Start

### Classic pragma (`h`)

```tsx
import { h, mount, useState } from "phasm"

function Counter() {
  const [count, setCount] = useState(0)
  return h("button", { onClick: () => setCount(count + 1) }, `Count: ${count}`)
}

mount(h(Counter, null), document.getElementById("app")!)
```

### Automatic JSX transform

Configure your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "phasm"
  }
}
```

Then write JSX as usual:

```tsx
import { mount, useState } from "phasm"

function Counter() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>Count: {count}</button>
}

mount(<Counter />, document.getElementById("app")!)
```

## API Reference

### Rendering

#### `render(vnode, container)`

Render a VNode tree into a DOM container. Handles initial mount and subsequent patches automatically. Pass `null` to unmount.

```ts
import { h, render } from "phasm"

render(h("div", null, "Hello"), document.getElementById("app")!)
render(null, document.getElementById("app")!) // unmount
```

#### `mount(vnode, parentDom)`

Mount a VNode tree into a parent DOM element. Lower-level than `render` -- does not track previous trees.

#### `patch(oldVNode, newVNode, parentDom)`

Diff and patch an existing VNode tree against a new one.

### VNode Creation

#### `h(type, props, ...children)`

Create a virtual DOM node. Used as the JSX pragma.

```ts
// Element
h("div", { className: "box" }, "Hello")

// Component
h(MyComponent, { title: "Hi" })

// Fragment
h(null, null, child1, child2)
```

#### `createTextVNode(text)`

Create a text VNode directly.

### Hooks

All hooks follow React's calling conventions. They must be called at the top level of a component function, in the same order on every render.

#### `useState(initialValue)`

```ts
const [count, setCount] = useState(0)
setCount(1)             // direct value
setCount(prev => prev + 1) // updater function
```

#### `useReducer(reducer, initialState)`

```ts
const [state, dispatch] = useReducer(
  (state, action) => {
    switch (action.type) {
      case "increment": return { count: state.count + 1 }
      default: return state
    }
  },
  { count: 0 }
)
dispatch({ type: "increment" })
```

#### `useEffect(callback, deps?)`

Run side effects after render. Returns an optional cleanup function.

```ts
useEffect(() => {
  const id = setInterval(tick, 1000)
  return () => clearInterval(id) // cleanup
}, []) // empty deps = run once
```

#### `useLayoutEffect(callback, deps?)`

Identical to `useEffect` in Phasm (all effects run synchronously). Provided for React API compatibility.

#### `useMemo(factory, deps)`

Memoize a computed value.

```ts
const sorted = useMemo(() => items.sort(compare), [items])
```

#### `useCallback(fn, deps)`

Memoize a callback reference. Equivalent to `useMemo(() => fn, deps)`.

#### `useRef(initialValue)`

Create a mutable ref object that persists across renders.

```ts
const inputRef = useRef<HTMLInputElement>(null)
```

#### `useSyncExternalStore(subscribe, getSnapshot)`

Subscribe to an external store. Re-renders when the snapshot changes.

```ts
const value = useSyncExternalStore(
  (onChange) => store.subscribe(onChange), // returns unsubscribe
  () => store.getState()                  // returns current snapshot
)
```

#### `useId()`

Generate a unique ID that is stable across server and client renders. Useful for accessibility attributes like `htmlFor`/`id` pairings.

```ts
function FormField() {
  const id = useId()
  return (
    <>
      <label for={id}>Name</label>
      <input id={id} />
    </>
  )
}
```

#### `useTransition()`

Returns `[isPending, startTransition]` for marking state updates as non-urgent. In Phasm's synchronous model, transitions complete immediately (`isPending` is always `false`). Provided for React API compatibility.

```ts
const [isPending, startTransition] = useTransition()

startTransition(() => {
  setSearchResults(filterItems(query))
})
```

#### `startTransition(callback)`

Standalone version of the transition API. Marks state updates inside the callback as non-urgent.

#### `useDeferredValue(value)`

Defer a value to allow more urgent updates to render first. In Phasm's synchronous model, returns the value immediately. Provided for React API compatibility.

```ts
const deferredQuery = useDeferredValue(query)
```

#### `useImperativeHandle(ref, createHandle, deps?)`

Customize the value exposed to parent components when using `forwardRef`.

```ts
const FancyInput = forwardRef((props, ref) => {
  const inputRef = useRef(null)
  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    clear: () => { inputRef.current.value = "" },
  }))
  return <input ref={inputRef} />
})
```

#### `useDebugValue(value, format?)`

Label custom hooks in dev tools. No-op in Phasm, provided for React API compatibility.

```ts
function useOnlineStatus() {
  const isOnline = useSyncExternalStore(subscribe, getSnapshot)
  useDebugValue(isOnline ? "Online" : "Offline")
  return isOnline
}
```

### Context

#### `createContext(defaultValue)`

Create a context for dependency injection without prop drilling.

```ts
const ThemeCtx = createContext("light")
```

#### `useContext(context)`

Read the current context value from the nearest Provider above.

```ts
function ThemedButton() {
  const theme = useContext(ThemeCtx)
  return h("button", { className: theme }, "Click")
}
```

#### `Context.Provider`

Provide a context value to a subtree.

```ts
h(ThemeCtx.Provider, { value: "dark" }, h(ThemedButton, null))
```

### Component Utilities

#### `memo(component, compare?)`

Memoize a component. Skips re-render when props are shallowly equal (or when `compare` returns `true`).

```ts
const ExpensiveList = memo(function ExpensiveList(props) {
  return h("ul", null, ...props.items.map(renderItem))
})

// With custom comparator
const Custom = memo(MyComp, (prev, next) => prev.id === next.id)
```

#### `forwardRef(render)`

Forward a `ref` prop as a second argument to the render function.

```ts
const FancyInput = forwardRef((props, ref) => {
  return h("input", { ref, className: "fancy" })
})
```

#### `createPortal(children, container)`

Render children into a DOM node outside the normal parent tree.

```ts
const modal = createPortal(
  h("div", { className: "modal" }, "Hello"),
  document.getElementById("modal-root")!
)
```

#### `ErrorBoundary`

Catches errors thrown during rendering of its descendants.

```ts
h(ErrorBoundary, {
  fallback: (error, reset) =>
    h("div", null,
      h("p", null, `Error: ${error}`),
      h("button", { onClick: reset }, "Retry")
    )
}, h(RiskyComponent, null))
```

#### `Suspense`

Shows fallback UI while lazy components are loading.

```ts
h(Suspense, { fallback: h("div", null, "Loading...") },
  h(LazyComponent, null))
```

#### `lazy(loader)`

Wrap a dynamic import for code-splitting. Works with `Suspense`.

```ts
const LazyDashboard = lazy(() => import("./Dashboard"))

// Use inside a Suspense boundary:
h(Suspense, { fallback: h("div", null, "Loading...") },
  h(LazyDashboard, null))
```

### Flags and Type Guards

VNodes use bitwise flags for type discrimination. Type guard functions are provided for narrowing:

```ts
import {
  isTextVNode,
  isElementVNode,
  isComponentVNode,
  isFragmentVNode,
  hasSingleChild,
  hasArrayChildren,
  hasTextChildren,
} from "phasm"
```

### Other Exports

| Export | Description |
|---|---|
| `VNode` | The VNode class |
| `VNodeFlags` | Bitwise VNode type flags |
| `ChildFlags` | Bitwise child shape flags |
| `createRef()` | Create a ref object |
| `flushUpdates()` | Synchronously flush pending state updates |
| `startTransition(fn)` | Mark state updates as non-urgent |
| `clearPool()` | Clear the VNode object pool |
| `getPoolSize()` | Get current pool size |
| `EMPTY_PROPS` | Shared empty props object |
| `__DEV__` | `true` when `NODE_ENV !== "production"` |
| `getComponentName(fn)` | Get display name of a component function |

## Server-Side Rendering

Phasm supports server-side rendering (SSR) and client-side hydration via the `phasm/server` entry point. It runs in any JavaScript runtime (Node.js, Deno, Bun, Cloudflare Workers, etc.) with zero DOM dependency on the server.

### `renderToString(vnode)`

Render a VNode tree to an HTML string on the server.

```ts
import { h } from "phasm"
import { renderToString } from "phasm/server"

function App() {
  return h("div", { className: "app" }, h("h1", null, "Hello from the server"))
}

const html = renderToString(h(App, null))
// => '<div class="app"><h1>Hello from the server</h1></div>'
```

Hooks work during SSR:
- `useState` / `useReducer` return initial values
- `useMemo` / `useCallback` compute normally
- `useRef` returns the initial ref object
- `useContext` reads from the context provider stack
- `useEffect` / `useLayoutEffect` are no-ops (effects never run on the server)

### `hydrate(vnode, container)`

Hydrate server-rendered HTML on the client. Walks existing DOM and attaches event listeners, component instances, and refs without re-creating DOM elements.

```ts
import { h } from "phasm"
import { hydrate } from "phasm/server"

function App() {
  return h("div", { className: "app" }, h("h1", null, "Hello from the server"))
}

hydrate(h(App, null), document.getElementById("app")!)
```

After hydration, the VNode tree is fully live and subsequent updates use the normal patch/diff path.

### `renderToReadableStream(vnode)`

Render a VNode tree to a `ReadableStream<string>` for chunked streaming. Uses the Web Streams API (Node 18+, Deno, Bun, Cloudflare Workers). Content is emitted in chunks as the tree is walked, enabling faster time-to-first-byte.

```ts
import { h } from "phasm"
import { renderToReadableStream } from "phasm/server"
import { App } from "./App"

export default {
  fetch() {
    const stream = renderToReadableStream(h(App, null))
    return new Response(stream, {
      headers: { "Content-Type": "text/html" },
    })
  },
}
```

### Example: Express server

```ts
import express from "express"
import { h } from "phasm"
import { renderToString } from "phasm/server"
import { App } from "./App"

const app = express()

app.get("/", (req, res) => {
  const appHtml = renderToString(h(App, null))
  res.send(`<!DOCTYPE html>
<html>
  <body>
    <div id="app">${appHtml}</div>
    <script src="/client.js"></script>
  </body>
</html>`)
})
```

## React Compatibility

Phasm provides a compatibility layer at `phasm/compat` that maps React's API surface to Phasm equivalents. This lets you use existing React component libraries with Phasm by aliasing `react` and `react-dom` in your bundler config.

### Bundler setup

**Vite / Rollup:**

```ts
export default {
  resolve: {
    alias: {
      react: "phasm/compat",
      "react-dom": "phasm/compat",
    },
  },
}
```

**webpack:**

```js
module.exports = {
  resolve: {
    alias: {
      react: "phasm/compat",
      "react-dom": "phasm/compat",
    },
  },
}
```

### What's included

| React API | Phasm equivalent |
|---|---|
| `createElement` | `h` |
| `Fragment` | `null` |
| `useState`, `useReducer`, `useEffect`, etc. | Direct re-exports |
| `useId`, `useTransition`, `useDeferredValue` | Direct re-exports |
| `useImperativeHandle`, `useDebugValue` | Direct re-exports |
| `startTransition` | Direct re-export |
| `memo`, `forwardRef`, `createRef`, `createContext` | Direct re-exports |
| `Suspense`, `lazy` | Direct re-exports |
| `render` | Direct re-export |
| `createPortal` | Direct re-export |
| `flushSync` | `flushUpdates` |
| `isValidElement` | VNode type check |
| `cloneElement` | Props merge + VNode clone |
| `Children` | `map`, `forEach`, `count`, `only`, `toArray` |
| `Component`, `PureComponent` | Stubs (throw if instantiated) |

### Limitations

- **Class components are not supported.** `Component` and `PureComponent` are exported as stubs for `instanceof` checks, but attempting to use them will throw. Use function components with hooks.
- **`React.createClass`** is not supported.
- **`findDOMNode`** is not provided. Use refs instead.
- **String refs** are not supported. Use `createRef()` or callback refs.

## Benchmarks

Phasm vs Inferno, Chromium headless (median of 50 runs):

| Operation | Phasm | Inferno | Ratio |
|---|---|---|---|
| Create 1,000 rows | 2.10ms | 2.20ms | 0.95x |
| Replace all 1,000 rows | 0.40ms | 0.60ms | 0.67x |
| Update every 10th row | 0.30ms | 0.50ms | 0.60x |
| Swap rows | 0.40ms | 0.50ms | 0.80x |
| Remove row | 0.30ms | 0.50ms | 0.60x |
| Select row | 0.30ms | 2.30ms | 0.13x |
| Append 1,000 rows | 2.20ms | 2.60ms | 0.85x |

Ratio < 1.0 = Phasm faster.

Bundle: **4.5 KB** min+gzip.

## Development

```bash
pnpm install
pnpm typecheck    # type check
pnpm lint         # lint with biome
pnpm test         # run tests
pnpm bench        # run microbenchmarks
pnpm build        # build dist/
```

## License

MIT
