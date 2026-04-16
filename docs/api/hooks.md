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

Identical to `useEffect` in Phasm. Provided for React API compatibility.

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
): T
```

Subscribes to an external store. The `subscribe` function receives a callback to notify of changes and must return an unsubscribe function. `getSnapshot` must return a referentially stable value when the underlying data hasn't changed.

## useTransition

```ts
function useTransition(): readonly [boolean, (callback: () => void) => void]
```

Returns `[isPending, startTransition]`. In Phasm's synchronous model, `isPending` is always `false`.

## useDeferredValue

```ts
function useDeferredValue<T>(value: T): T
```

Returns the value as-is. Exists for React API compatibility.

## useDebugValue

```ts
function useDebugValue(value: unknown, format?: (v: unknown) => unknown): void
```

No-op in Phasm. Exists for React API compatibility.

## use

```ts
function use<T>(usable: Promise<T> | Context<T>): T
```

Reads a context value or a promise. When given a pending promise, throws to trigger the nearest Suspense boundary.
