# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.0.1] - 2025-04-16

Initial release.

### Added

**Core**

- Inferno-style LIS keyed diffing algorithm with small-list bitmask fast path
- V8-optimized: monomorphic call sites, stable hidden classes, SMI-friendly flags, object pooling
- Priority-based scheduler with three lanes (Sync, Default, Transition)
- Automatic JSX transform (`jsx-runtime`) and classic `h()` pragma
- Dual ESM/CJS output with full TypeScript declarations

**Hooks**

- `useState` (with lazy initializer and functional updater)
- `useReducer`
- `useEffect` / `useLayoutEffect`
- `useMemo` / `useCallback`
- `useRef`
- `useContext`
- `useSyncExternalStore` (with tearing prevention via Sync lane)
- `useId` (stable across SSR and hydration)
- `useTransition` / `startTransition`
- `useDeferredValue`
- `useImperativeHandle`
- `useDebugValue` (no-op, React API compatibility)
- `use` (React 19: Promises + Context, conditionally callable)

**Components**

- `memo()` with optional custom comparator
- `forwardRef()`
- `createPortal()`
- `ErrorBoundary` with fallback and reset
- `Suspense` with fallback UI
- `lazy()` for code-splitting
- `StrictMode` (no-op passthrough for compat)
- `Profiler` (no-op passthrough for compat)

**Context**

- `createContext` / `useContext` / `Context.Provider` / `Context.Consumer`

**Rendering**

- `render()` for managed mount/patch/unmount
- `mount()` / `patch()` / `unmount()` lower-level APIs
- `createRoot()` / `hydrateRoot()` (React 18 root API)
- `act()` testing utility (flushes sync and async updates)

**Server-Side Rendering (`phasm/server`)**

- `renderToString` for synchronous HTML string rendering
- `renderToStringAsync` for Suspense-aware async rendering
- `renderToReadableStream` for out-of-order streaming via Web Streams API
- `hydrate` for client-side rehydration with zero DOM replacement
- Selective hydration with event-driven prioritization
- Full hook support during SSR (effects are no-ops)

**React Compatibility (`phasm/compat`)**

- Drop-in alias for `react`, `react-dom`, and `react-dom/client` in bundler config
- `createElement`, `Fragment`, `Children`, `cloneElement`, `isValidElement`
- `flushSync`, `Component`/`PureComponent` stubs
- `useOptimistic` (optimistic UI state, React 19)
- `useActionState` (form action reducer, React 19)
- `useFormStatus` (form status, React 19)

**Developer Experience**

- Development-mode warnings for duplicate keys and hook order violations
- `getComponentName()` with displayName support
- `__DEV__` flag, tree-shakeable in production builds
- Chrome DevTools extension for component tree inspection
