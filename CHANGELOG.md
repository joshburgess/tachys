# Changelog

## 0.0.1

Initial release.

### Core

- Inferno-style LIS keyed diffing algorithm
- V8-optimized: monomorphic call sites, stable hidden classes, SMI-friendly flags, object pooling
- Automatic JSX transform (`jsx-runtime`) and classic `h()` pragma
- Dual ESM/CJS output with full TypeScript declarations

### Hooks

- `useState` (with lazy initializer support)
- `useReducer`
- `useEffect`
- `useLayoutEffect`
- `useMemo`
- `useCallback`
- `useRef`
- `useSyncExternalStore`
- `useId` (stable across SSR and hydration)
- `useTransition` / `startTransition`
- `useDeferredValue`
- `useImperativeHandle`
- `useDebugValue`

### Components

- `memo()` with optional custom comparator
- `forwardRef()`
- `createPortal()`
- `ErrorBoundary` with fallback and reset
- `Suspense` with fallback UI
- `lazy()` for code-splitting

### Context

- `createContext` / `useContext` / `Context.Provider`

### Server-Side Rendering (`phasm/server`)

- `renderToString` for synchronous HTML string rendering
- `renderToReadableStream` for chunked streaming via Web Streams API
- `hydrate` for client-side rehydration with zero DOM replacement
- Full hook support during SSR (effects are no-ops)

### React Compatibility (`phasm/compat`)

- Drop-in alias for `react` and `react-dom` in bundler config
- `createElement`, `Fragment`, `Children`, `cloneElement`, `isValidElement`
- `flushSync`, `Component`/`PureComponent` stubs

### Developer Experience

- Development-mode warnings for duplicate keys and hook order violations
- `getComponentName()` with displayName support
- `__DEV__` flag, tree-shakeable in production builds
