# Tachys

A virtual DOM library with a React-like hooks API and concurrent rendering. Reconciliation uses the same LIS keyed-diff algorithm as [Inferno](https://github.com/infernojs/inferno), with additional V8-focused tuning (monomorphic call sites, stable hidden classes, SMI-friendly flags, object pooling).

On the official [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark) (Krausest), Tachys is **at parity with Inferno on total click-to-paint time (1.007x geomean)** and **~18% faster on script time (0.823x geomean)**. See [Benchmarks](#benchmarks) for per-op numbers.

**~36KB min / ~11KB gzip** for the core runtime. Zero dependencies.

## Features

- Inferno-style LIS keyed diffing algorithm
- V8-optimized: monomorphic call sites, stable hidden classes, SMI-friendly flags, object pooling
- Priority-based scheduler with three lanes (Sync, Default, Transition) and fiber-style mid-render yield
- Two-phase commit for the Transition lane with effect queue, abandonment rollback, and Suspense retry
- Full hooks API: `useState`, `useReducer`, `useEffect`, `useLayoutEffect`, `useMemo`, `useCallback`, `useRef`, `useSyncExternalStore`, `useId`, `useTransition`, `useDeferredValue`, `use`
- `memo()`, `forwardRef()`, `createPortal()`, `ErrorBoundary`, `Suspense`
- `Suspense` + `lazy()` for code splitting
- `ErrorBoundary` with Suspense integration
- React 19 `use()` hook for Promises and Context
- `useSyncExternalStore` with tearing prevention (Sync lane scheduling)
- Context API with `createContext` / `useContext` / `Context.Consumer`
- Server-side rendering: `renderToString`, `renderToStringAsync`, `renderToReadableStream`
- Suspense-aware hydration with streaming SSR support
- Selective hydration with event-driven prioritization
- Automatic JSX transform (`jsx-runtime`) and classic `h()` pragma
- React 18 root API: `createRoot`, `hydrateRoot`
- React 19 form hooks: `useOptimistic`, `useActionState`, `useFormStatus`
- `StrictMode` and `Profiler` compatibility stubs
- `act()` testing utility for synchronous flush
- React compatibility layer (`tachys/compat`) for library interop
- Chrome DevTools extension for component tree inspection
- Dual ESM/CJS output with full TypeScript declarations
- Development-mode warnings (duplicate keys, hook order violations) stripped in production

## Install

```bash
npm install tachys
```

## Quick Start

### Classic pragma (`h`)

```tsx
import { h, mount, useState } from "tachys"

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
    "jsxImportSource": "tachys"
  }
}
```

Then write JSX as usual:

```tsx
import { mount, useState } from "tachys"

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
import { h, render } from "tachys"

render(h("div", null, "Hello"), document.getElementById("app")!)
render(null, document.getElementById("app")!) // unmount
```

#### `createRoot(container)`

Create a concurrent root. Returns a `Root` object with `render(children)` and `unmount()` methods. This is the React 18+ root API.

```ts
import { createRoot, h } from "tachys"

const root = createRoot(document.getElementById("app")!)
root.render(h(App, null))
root.unmount()
```

#### `hydrateRoot(container, initialChildren)`

Hydrate server-rendered HTML and return a `Root` for subsequent updates.

```ts
import { hydrateRoot, h } from "tachys"

const root = hydrateRoot(document.getElementById("app")!, h(App, null))
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

Identical to `useEffect` in Tachys (all effects run synchronously). Provided for React API compatibility.

#### `useInsertionEffect(callback, deps?)`

Identical to `useEffect` in Tachys. In React, this fires before DOM mutations for CSS-in-JS libraries. Exported for compatibility with styled-components, Emotion, and similar libraries.

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

#### `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot?)`

Subscribe to an external store with tearing prevention. Re-renders when the snapshot changes. Updates are scheduled at `Lane.Sync` priority to prevent tearing across concurrent reads.

```ts
const value = useSyncExternalStore(
  (onChange) => store.subscribe(onChange), // returns unsubscribe
  () => store.getState(),                 // returns current snapshot
  () => store.getServerState(),           // optional: snapshot for SSR
)
```

#### `use(usable)`

React 19-compatible `use()` hook. Works with both Context and Promise values. Unlike other hooks, `use()` can be called conditionally.

```ts
// Read a context value (can be called inside conditionals)
const theme = use(ThemeContext)

// Read a promise (must be inside a Suspense boundary)
const data = use(fetchPromise)
```

When passed a Promise, `use()` suspends the component until the promise resolves. The resolved value is cached, so subsequent renders return it synchronously. If the promise rejects, the error can be caught by an `ErrorBoundary` inside the `Suspense` boundary.

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

Returns `[isPending, startTransition]` for marking state updates as non-urgent. Updates inside `startTransition` are scheduled at `Lane.Transition` priority, allowing higher-priority Sync and Default updates to process first.

```ts
const [isPending, startTransition] = useTransition()

startTransition(() => {
  setSearchResults(filterItems(query))
})
```

#### `startTransition(callback)`

Standalone version of the transition API. Marks state updates inside the callback as `Lane.Transition` priority.

#### `useDeferredValue(value)`

Defer a value to allow more urgent updates to render first. The deferred update is scheduled at `Lane.Transition` priority.

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

Label custom hooks in dev tools. No-op in Tachys, provided for React API compatibility.

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

#### `Context.Consumer`

Render-prop component for reading context. Useful for interop with third-party libraries.

```tsx
<ThemeCtx.Consumer>
  {(theme) => <button className={theme}>Click</button>}
</ThemeCtx.Consumer>
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

Catches errors thrown during rendering of its descendants. The `fallback` prop receives the error and a `reset` function that re-renders the children.

```ts
h(ErrorBoundary, {
  fallback: (error, reset) =>
    h("div", null,
      h("p", null, `Error: ${error}`),
      h("button", { onClick: reset }, "Retry")
    )
}, h(RiskyComponent, null))
```

`ErrorBoundary` works with `Suspense`. Place an `ErrorBoundary` *inside* a `Suspense` boundary to catch errors from lazy-loaded components (including rejected promises from `lazy()` and `use()`):

```ts
h(Suspense, { fallback: h("div", null, "Loading...") },
  h(ErrorBoundary, {
    fallback: (err) => h("div", null, `Failed: ${err.message}`),
  },
    h(LazyComponent, null),
  ),
)
```

> **Note:** An `ErrorBoundary` *wrapping* a `Suspense` boundary cannot catch async rejections from lazy components, because the re-render is triggered by the scheduler (no parent error handler on the stack). This would require fiber-tree error propagation. The `ErrorBoundary`-inside-`Suspense` pattern works correctly.

#### `Suspense`

Shows fallback UI while lazy children or `use(promise)` calls are pending.

```ts
h(Suspense, { fallback: h("div", null, "Loading...") },
  h(LazyComponent, null))
```

#### `lazy(loader)`

Wrap a dynamic import for code-splitting. Works with `Suspense`. The loader must return a promise with a `default` export.

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
} from "tachys"
```

### Scheduler

Tachys uses a priority-based scheduler with three lanes:

| Lane | Value | Description |
|------|-------|-------------|
| `Lane.Sync` | `0` | Highest priority. Used by `useSyncExternalStore` for tearing prevention. |
| `Lane.Default` | `1` | Normal state updates from `useState`, `useReducer`. |
| `Lane.Transition` | `2` | Low priority. Used by `startTransition`, `useTransition`, `useDeferredValue`. |
| `Lane.Idle` | `-1` | Sentinel for "no lane active". |

Transition-lane renders use a two-phase commit. The render phase collects DOM mutations into an effect queue; the commit phase flushes them atomically. If a higher-priority update preempts the Transition, the queue is discarded and hook state / ref callbacks are rolled back. Keyed and non-keyed children diffing also yields mid-render when the ~5ms time slice expires and resumes on the next scheduler tick.

#### `flushUpdates()`

Synchronously flush all pending state updates across all lanes.

#### `flushSyncWork()`

Flush only the Sync lane.

#### `shouldYield()`

Returns `true` if the current time slice (~5ms) has expired. Used internally by the work loop.

### Other Exports

| Export | Description |
|---|---|
| `VNode` | The VNode class |
| `VNodeFlags` | Bitwise VNode type flags |
| `ChildFlags` | Bitwise child shape flags |
| `createRef()` | Create a ref object |
| `Lane` | Scheduler lane constants (`Sync`, `Default`, `Transition`) |
| `clearPool()` | Clear the VNode object pool |
| `getPoolSize()` | Get current pool size |
| `EMPTY_PROPS` | Shared empty props object |
| `__DEV__` | `true` when `NODE_ENV !== "production"` |
| `getComponentName(fn)` | Get display name of a component function |

## Server-Side Rendering

Tachys supports server-side rendering (SSR) and client-side hydration via the `tachys/server` entry point. It runs in any JavaScript runtime (Node.js, Deno, Bun, Cloudflare Workers, etc.) with zero DOM dependency on the server.

```ts
import { renderToString, renderToStringAsync, renderToReadableStream, hydrate } from "tachys/server"
```

### `renderToString(vnode)`

Synchronous render to an HTML string. Suspense boundaries render their fallback content (lazy components are not awaited).

```ts
import { h } from "tachys"
import { renderToString } from "tachys/server"

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
- `useId` generates deterministic IDs
- `useEffect` / `useLayoutEffect` are no-ops (effects never run on the server)

### `renderToStringAsync(vnode)`

Async render that waits for all Suspense boundaries to resolve before returning. Useful when you want the full page content including lazy-loaded components.

```ts
const html = await renderToStringAsync(h(App, null))
```

### `renderToReadableStream(vnode)`

Streaming SSR using the Web Streams API. Sends fallback HTML immediately for suspended boundaries, then streams resolved content with inline swap scripts as promises resolve.

The streaming protocol works as follows:
1. Fallback content is sent immediately inside `<span id="ph:N">` placeholder elements
2. When a Suspense boundary resolves, the resolved content is sent in a `<div hidden id="phr:N">` element along with an inline `<script>` that swaps the placeholder with the resolved content
3. On the client, hydration cleans up any remaining streaming artifacts (scripts, hidden divs, `<!--$ph:N-->` comments)

```ts
import { h } from "tachys"
import { renderToReadableStream } from "tachys/server"

export default {
  fetch() {
    const stream = renderToReadableStream(h(App, null))
    return new Response(stream, {
      headers: { "Content-Type": "text/html" },
    })
  },
}
```

### `hydrate(vnode, container)`

Hydrate server-rendered HTML on the client. Walks existing DOM and attaches event listeners, component instances, and refs without re-creating DOM elements.

```ts
import { h } from "tachys"
import { hydrate } from "tachys/server"

hydrate(h(App, null), document.getElementById("app")!)
```

Hydration handles:
- **Suspense boundaries**: both streaming (with placeholders) and non-streaming (children rendered synchronously)
- **Streaming SSR artifact cleanup**: removes swap scripts, placeholder comments (`<!--$ph:N-->`), and hidden divs (`<div hidden id="phr:N">`)
- **Selective hydration**: prioritizes Suspense boundaries the user interacts with (click, input, keydown, focusin events) for faster time-to-interactive
- **Lazy components**: if a `lazy()` component hasn't loaded yet during hydration, the fallback is shown until the component resolves

After hydration, the VNode tree is fully live and subsequent state updates use the normal patch/diff path.

### Example: Express server

```ts
import express from "express"
import { h } from "tachys"
import { renderToString } from "tachys/server"
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

### Example: Streaming with Web Streams

```ts
import { h } from "tachys"
import { renderToReadableStream, hydrate } from "tachys/server"
import { Suspense, lazy } from "tachys"

const LazyContent = lazy(() => import("./HeavyContent"))

function App() {
  return h("div", null,
    h("h1", null, "My App"),
    h(Suspense, { fallback: h("div", null, "Loading...") },
      h(LazyContent, null),
    ),
  )
}

// Server: stream the response
const stream = renderToReadableStream(h(App, null))

// Client: hydrate when the page loads
hydrate(h(App, null), document.getElementById("root")!)
```

## React Compatibility

Tachys provides a compatibility layer at `tachys/compat` that maps React's API surface to Tachys equivalents. This lets you use existing React component libraries with Tachys by aliasing `react` and `react-dom` in your bundler config.

### Bundler setup

**Vite / Rollup:**

```ts
export default {
  resolve: {
    alias: {
      react: "tachys/compat",
      "react-dom": "tachys/compat",
      "react-dom/client": "tachys/client",
      "react-dom/server": "tachys/server",
    },
  },
}
```

**webpack:**

```js
module.exports = {
  resolve: {
    alias: {
      react: "tachys/compat",
      "react-dom": "tachys/compat",
      "react-dom/client": "tachys/client",
      "react-dom/server": "tachys/server",
    },
  },
}
```

> **Note:** Modern React code often imports `createRoot` and `hydrateRoot` from `react-dom/client`. The `tachys/client` export points to the same compat module, so both import paths work.

### What's included

| React API | Tachys equivalent |
|---|---|
| `createElement` | `h` |
| `Fragment` | `null` |
| `useState`, `useReducer`, `useEffect`, etc. | Direct re-exports |
| `useId`, `useTransition`, `useDeferredValue` | Direct re-exports |
| `useImperativeHandle`, `useDebugValue` | Direct re-exports |
| `useSyncExternalStore` | Direct re-export (with tearing prevention) |
| `use` | Direct re-export (React 19 Promises + Context) |
| `startTransition` | Direct re-export |
| `memo`, `forwardRef`, `createRef`, `createContext` | Direct re-exports |
| `Suspense`, `lazy`, `ErrorBoundary` | Direct re-exports |
| `render` | Direct re-export |
| `createRoot`, `hydrateRoot` | Direct re-exports (React 18 root API) |
| `createPortal` | Direct re-export |
| `flushSync` | `flushUpdates` |
| `isValidElement` | VNode type check |
| `cloneElement` | Props merge + VNode clone |
| `Children` | `map`, `forEach`, `count`, `only`, `toArray` |
| `Component`, `PureComponent` | Stubs (throw if instantiated) |
| `StrictMode` | No-op passthrough |
| `Profiler` | No-op passthrough |
| `act` | Testing utility (flushes sync/async updates) |
| `useOptimistic` | Optimistic UI state (React 19) |
| `useActionState` | Form action reducer (React 19) |
| `useFormStatus` | Form status (React 19) |

### Limitations

- **Class components are not supported.** `Component` and `PureComponent` are exported as stubs for `instanceof` checks, but attempting to use them will throw. Use function components with hooks.
- **`React.createClass`** is not supported.
- **`findDOMNode`** is not provided. Use refs instead.
- **String refs** are not supported. Use `createRef()` or callback refs.

## Benchmarks

Official [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark) (Krausest), Puppeteer runner, headless Chrome, 4x CPU throttling, 15 iterations per op (25 for `04_select1k`). Both frameworks use their upstream framework entries (Inferno uses `$HasKeyedChildren` + `Row.defaultHooks.onComponentShouldUpdate`; Tachys uses `babel-plugin-tachys` v1.1).

Numbers are **median total** (click-to-paint, ms) and **median script** (JS CPU time, ms) as produced by the official harness.

| Benchmark              | Tachys total | Inferno total | T/I total | Tachys script | Inferno script | T/I script |
|------------------------|--------------|---------------|-----------|---------------|----------------|------------|
| 01_run1k               | 35.90        | 37.20         | 0.97x     | 2.80          | 4.90           | 0.57x      |
| 02_replace1k           | 41.00        | 41.70         | 0.98x     | 6.70          | 7.70           | 0.87x      |
| 03_update10th1k_x16    | 25.10        | 23.80         | 1.05x     | 1.60          | 2.00           | 0.80x      |
| 04_select1k            | 7.30         | 8.20          | 0.89x     | 1.20          | 1.60           | 0.75x      |
| 05_swap1k              | 26.90        | 26.30         | 1.02x     | 1.70          | 1.40           | 1.21x      |
| 06_remove-one-1k       | 19.80        | 19.40         | 1.02x     | 0.60          | 0.50           | 1.20x      |
| 07_create10k           | 388.30       | 395.50        | 0.98x     | 34.40         | 53.60          | 0.64x      |
| 08_create1k-after1k_x2 | 45.40        | 45.40         | 1.00x     | 2.80          | 5.70           | 0.49x      |
| 09_clear1k_x8          | 20.00        | 17.20         | 1.16x     | 16.30         | 12.90          | 1.26x      |

**Geomean: total 1.007x, script 0.823x** (Tachys / Inferno).

Tachys is at parity with Inferno on click-to-paint and wins decisively on script time. The remaining script-side outliers are `09_clear1k_x8` (1.26x) and `05_swap1k` / `06_remove-one-1k` (~1.2x on sub-millisecond denominators).

Reproduction steps and per-run notes: [`benchmarks/results/krausest-official.md`](benchmarks/results/krausest-official.md).

## Entry Points

| Import path | Description | Min+gzip |
|---|---|---|
| `tachys` | Core client-side library (full concurrent scheduler) | ~11 KB |
| `tachys/sync` | Drops the concurrent scheduler. Same hooks API, sync-only commit. | ~8.8 KB |
| `tachys/sync-core` | Lean sync core: drops Suspense/lazy/ErrorBoundary/Portal in addition. | ~6.8 KB |
| `tachys/server` | SSR: `renderToString`, `renderToStringAsync`, `renderToReadableStream`, `hydrate` | ~7.2 KB |
| `tachys/hydrate` | Client hydration entry (split out of `tachys/server` for client bundles) | ~8.8 KB |
| `tachys/compiled` | Runtime helpers used by `babel-plugin-tachys` output | ~2.6 KB |
| `tachys/jsx-runtime` | Automatic JSX transform (`jsx`, `jsxs`, `Fragment`) | ~0.7 KB |
| `tachys/jsx-dev-runtime` | Dev-mode JSX transform (`jsxDEV`, `Fragment`) | ~0.8 KB |
| `tachys/compat` | React API surface for bundler aliasing | ~13 KB |
| `tachys/client` | Alias of `tachys/compat` for `react-dom/client` | (same) |
| `tachys/tags` | Typed tag-name helpers (`div`, `span`, `button`, ...) for no-JSX setups | (tree-shakes) |

All entry points ship as both ESM and CJS with TypeScript declarations.

## Development

```bash
pnpm install            # Install dependencies
pnpm test               # Run tests (962 tests across 55 files)
pnpm run typecheck      # Type check
pnpm run build          # Build dist/
pnpm run bench          # Run microbenchmarks (internal, non-authoritative)
pnpm run bench:browser  # Run in-repo browser harness (non-authoritative; use Krausest for real numbers)
pnpm run lint           # Lint with Biome
pnpm run lint:fix       # Lint and auto-fix
```

## DevTools

Tachys includes a Chrome DevTools extension in the `devtools/` directory. It provides:

- Component tree inspection
- Render event tracking
- Highlighted element overlay

To use it, load the `devtools/` directory as an unpacked extension in `chrome://extensions`.

## License

Dual licensed under [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE).
