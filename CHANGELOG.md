# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

### Added

**Concurrent rendering**

- Two-phase commit for the Transition lane: render phase collects DOM mutations into a typed effect queue (`pushAppend`/`pushInsert`/`pushRemove`/`pushThunk`), commit phase flushes them in order after the render completes successfully.
- Fiber-style mid-render yield inside keyed and non-keyed child diffing. Transition-lane renders yield when the ~5ms time slice expires and resume from where they left off on the next scheduler tick.
- Transition abandonment: a higher-priority update arriving mid-Transition discards the collected effect queue without touching the DOM. Hook state (value + pending updates) and ref callbacks are rolled back so the next render sees the pre-Transition state.
- Suspense + Transition interaction: components that throw a promise during a Transition-lane render signal suspension to the scheduler instead of committing a fallback. The Transition retries when the promise resolves.
- `Lane.Idle` sentinel (`-1`) for "no lane active".
- `useDeferredValue(value, initialValue?)` second-argument overload (React 19).
- `useOptimistic` is now lane-aware: reverts to passthrough during Transition renders so optimistic values don't persist across abandoned transitions.
- `useActionState` async resolution now wraps state updates in `startTransition`.

**Shared render state**

- New `R` singleton (`src/render-state.ts`) holding `collecting`, `activeLane`, and `pending` flags. Hot-path callers read these as property loads instead of cross-module function calls so V8 can inline the concurrent-mode guards.

### Changed

- Scheduler `processAllLanes` is split into a dedicated Sync+Default loop and a Transition loop. Sync/Default flushes no longer pay the `R.pending` check that only matters for resumable Transition work.
- Diff, mount, and unmount inline the `R.collecting` branch at each DOM mutation site rather than going through `domAppendChild`/`domRemoveChild`/`domInsertBefore` wrappers.
- `patchKeyedChildren` and `patchNonKeyedChildren` have separate Sync fast paths and resumable Transition paths.
- VNode pool releases are guarded by `R.collecting` so that abandoning a Transition render cannot corrupt pooled VNodes.

### Fixed

- Suspense + Transition retry now preserves transition restorers across `discardEffects` and reorders `abandonTransition` to restore state before discarding effects.

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

**Server-Side Rendering (`tachys/server`)**

- `renderToString` for synchronous HTML string rendering
- `renderToStringAsync` for Suspense-aware async rendering
- `renderToReadableStream` for out-of-order streaming via Web Streams API
- `hydrate` for client-side rehydration with zero DOM replacement
- Selective hydration with event-driven prioritization
- Full hook support during SSR (effects are no-ops)

**React Compatibility (`tachys/compat`)**

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
