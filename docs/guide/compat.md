# React Compatibility

Phasm provides a compatibility layer at `phasm/compat` that mirrors the React API, allowing you to use React-ecosystem libraries.

## Setup

### Vite

```ts
// vite.config.ts
import { defineConfig } from "vite"

export default defineConfig({
  resolve: {
    alias: {
      react: "phasm/compat",
      "react-dom": "phasm/compat",
      "react-dom/client": "phasm/client",
      "react-dom/server": "phasm/server",
    },
  },
  esbuild: {
    jsxImportSource: "phasm",
  },
})
```

### Webpack

```js
// webpack.config.js
module.exports = {
  resolve: {
    alias: {
      react: "phasm/compat",
      "react-dom": "phasm/compat",
      "react-dom/client": "phasm/client",
      "react-dom/server": "phasm/server",
    },
  },
}
```

## What's Included

The compat module re-exports the full core API plus React-specific names:

| React API | Phasm equivalent |
|-----------|-------------------|
| `createElement` | `h` |
| `Fragment` | `null` (fragment sentinel) |
| All hooks (`useState`, `useEffect`, etc.) | Direct re-exports |
| `useSyncExternalStore` | Direct re-export (with tearing prevention) |
| `use` | Direct re-export (React 19 Promises + Context) |
| `useTransition`, `startTransition` | Direct re-exports (lane-based scheduling) |
| `useDeferredValue` | Direct re-export (lane-based scheduling) |
| `memo`, `forwardRef`, `createRef`, `createContext` | Direct re-exports |
| `Suspense`, `lazy`, `ErrorBoundary` | Direct re-exports |
| `render`, `createPortal` | Direct re-exports |
| `createRoot`, `hydrateRoot` | Direct re-exports (React 18 root API) |
| `flushSync` | `flushUpdates` |
| `Children.map/forEach/count/only/toArray` | Built-in utilities |
| `cloneElement` | Clones VNode with merged props |
| `isValidElement` | Checks if value is a VNode |
| `Component` / `PureComponent` | Stubs (throws if instantiated) |
| `StrictMode` | No-op passthrough |
| `Profiler` | No-op passthrough |
| `act` | Testing utility (flushes sync/async updates) |
| `useOptimistic` | Optimistic UI state (React 19) |
| `useActionState` | Form action reducer (React 19) |
| `useFormStatus` | Form status (always idle) |

## Limitations

- **Class components** are not supported. `Component` and `PureComponent` are exported as stubs that throw if instantiated. Use functional components instead.
- **Synthetic events** are not wrapped. Event handlers receive native DOM events directly. Most React code works fine since the native API is a superset.
- **`findDOMNode`** is not provided. Use refs instead.
- **String refs** are not supported. Use `createRef()` or callback refs.
