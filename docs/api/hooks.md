# Hooks API

All hooks must be called at the top level of a component function, in the same order on every render.

## useState

```ts
function useState<T>(initial: T): readonly [T, (value: T | ((prev: T) => T)) => void]
```

Declares a state variable. The initial value can be a raw value or a lazy initializer function.

## useReducer

```ts
function useReducer<S, A>(
  reducer: (state: S, action: A) => S,
  initialState: S,
): readonly [S, (action: A) => void]
```

Manages state with a reducer function.

## useEffect

```ts
function useEffect(
  callback: () => void | (() => void),
  deps?: readonly unknown[],
): void
```

Runs a side effect after render. The callback may return a cleanup function. If `deps` is provided, the effect only re-runs when deps change. Pass `[]` to run once on mount.

## useLayoutEffect

```ts
function useLayoutEffect(
  callback: () => void | (() => void),
  deps?: readonly unknown[],
): void
```

Identical to `useEffect` in Tachys. Provided for React API compatibility.

## useInsertionEffect

```ts
function useInsertionEffect(
  callback: () => void | (() => void),
  deps?: readonly unknown[],
): void
```

Identical to `useEffect` in Tachys. In React, `useInsertionEffect` fires before any DOM mutations and is intended for CSS-in-JS libraries to inject `<style>` rules. Exported for compatibility with styled-components, Emotion, and similar libraries.

## useMemo

```ts
function useMemo<T>(factory: () => T, deps: readonly unknown[]): T
```

Returns a memoized value, recomputing only when `deps` change.

## useCallback

```ts
function useCallback<T extends Function>(callback: T, deps: readonly unknown[]): T
```

Returns a memoized callback. Equivalent to `useMemo(() => callback, deps)`.

## useRef

```ts
function useRef<T>(initial: T): { current: T }
```

Returns a mutable ref object that persists across renders. Commonly used to hold DOM element references.

## useContext

```ts
function useContext<T>(context: Context<T>): T
```

Reads the current value of a context from the nearest Provider ancestor.

## useId

```ts
function useId(): string
```

Returns a unique ID string (e.g., `":b0:"`) stable across server and client renders.

## useImperativeHandle

```ts
function useImperativeHandle<T>(
  ref: RefObject<T> | ((instance: T) => void) | null | undefined,
  createHandle: () => T,
  deps?: readonly unknown[],
): void
```

Customizes the value exposed to parent components when using `forwardRef`.

## useSyncExternalStore

```ts
function useSyncExternalStore<T>(
  subscribe: (onStoreChange: () => void) => () => void,
  getSnapshot: () => T,
  getServerSnapshot?: () => T,
): T
```

Subscribes to an external store with tearing prevention. The `subscribe` function receives a callback to notify of changes and must return an unsubscribe function. `getSnapshot` must return a referentially stable value when the underlying data hasn't changed.

On every render, the current snapshot is compared against the stored value. If it has changed (e.g., a store update occurred between scheduling and rendering), the component re-renders immediately at `Lane.Sync` priority to prevent tearing.

The optional `getServerSnapshot` parameter provides a snapshot for server-side rendering contexts.

## useTransition

```ts
function useTransition(): readonly [boolean, (callback: () => void) => void]
```

Returns `[isPending, startTransition]`. State updates inside `startTransition` are scheduled at `Lane.Transition` priority, allowing higher-priority Sync and Default updates to process first.

Transition renders use a two-phase commit. If a higher-priority update arrives mid-Transition, the in-flight render is abandoned: collected DOM effects are discarded and hook state / ref callbacks are rolled back to pre-Transition values. If a component throws a promise during a Transition, the scheduler retries when the promise resolves instead of committing a Suspense fallback.

## startTransition

```ts
function startTransition(callback: () => void): void
```

Standalone version of the transition API. Marks state updates inside the callback as `Lane.Transition` priority.

## useDeferredValue

```ts
function useDeferredValue<T>(value: T, initialValue?: T): T
```

Defers a value to allow more urgent updates to render first. The deferred update is scheduled at `Lane.Transition` priority.

The optional `initialValue` (React 19) is returned on the first render before the deferred update catches up.

## useDebugValue

```ts
function useDebugValue(value: unknown, format?: (v: unknown) => unknown): void
```

No-op in Tachys. Exists for React API compatibility.

## use

```ts
function use<T>(usable: Promise<T> | Context<T>): T
```

React 19-compatible hook that reads a context value or a promise. Unlike other hooks, `use()` can be called conditionally (inside `if` blocks, loops, etc.).

**With Context:** Returns the current context value, equivalent to `useContext(ctx)`.

**With Promise:** If the promise is already resolved, returns the cached value synchronously. If pending, throws to trigger the nearest `Suspense` boundary. The component re-renders once the promise resolves. If the promise rejects, the error can be caught by an `ErrorBoundary` inside the `Suspense` boundary.

---

## React 19 Form Hooks

The following hooks are imported from `tachys/compat`, not the core `tachys` package.

```ts
import { useOptimistic, useActionState, useFormStatus } from "tachys/compat"
```

## useOptimistic

```ts
function useOptimistic<T, A>(
  passthrough: T,
  updateFn?: (currentState: T, optimisticValue: A) => T,
): [T, (action: A) => void]
```

Manages optimistic UI state. Returns the current optimistic state and a setter function. When an optimistic update is applied, the state is immediately updated using `updateFn`. When `passthrough` changes and no optimistic update is active, the state syncs back to the new `passthrough` value.

## useActionState

```ts
function useActionState<S, P>(
  action: (prevState: S, payload: P) => S | Promise<S>,
  initialState: S,
  permalink?: string,
): [S, (payload: P) => void, boolean]
```

Manages form action state with a reducer pattern. Returns `[state, dispatch, isPending]`. Calling `dispatch` invokes `action` with the current state and the given payload, then updates state with the result. Handles both synchronous and asynchronous actions. `isPending` is `true` while an async action is in flight.

## useFormStatus

```ts
function useFormStatus(): {
  pending: boolean
  data: FormData | null
  method: string | null
  action: string | null
}
```

Returns the status of a parent form action. Always returns a not-pending status (`pending: false`, all other fields `null`) because Tachys does not include a built-in form action runtime. Exported for compatibility with third-party components that call this hook.
