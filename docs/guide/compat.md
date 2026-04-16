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
    },
  },
}
```

## What's Included

The compat module re-exports the full core API plus React-specific names:

| React API | Phasm equivalent |
|-----------|-------------------|
| `createElement` | `h` |
| `flushSync` | `flushUpdates` |
| `Fragment` | `null` (fragment sentinel) |
| `Children.map/forEach/count/only/toArray` | Built-in utilities |
| `cloneElement` | Clones VNode with merged props |
| `isValidElement` | Checks if value is a VNode |
| `Component` / `PureComponent` | Stubs (throws if instantiated) |

## Limitations

- **Class components** are not supported. `Component` and `PureComponent` are exported as stubs that throw if instantiated. Use functional components instead.
- **Synthetic events** are not wrapped. Event handlers receive native DOM events directly. Most React code works fine since the native API is a superset.
- **Concurrent features** (`useTransition`, `useDeferredValue`) exist for API compatibility but execute synchronously.
