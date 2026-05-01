# Component API

## memo

```ts
function memo<P>(
  component: (props: P) => VNode,
  compare?: (prevProps: P, nextProps: P) => boolean,
): MemoComponentFn
```

Returns a memoized version of the component that skips re-rendering when props are shallowly equal. Pass a custom `compare` function for fine-grained control.

## forwardRef

```ts
function forwardRef<T, P>(
  render: (props: P, ref: RefObject<T>) => VNode,
): (props: P & { ref?: RefObject<T> }) => VNode
```

Creates a component that forwards the `ref` prop to a child element or imperative handle.

## lazy

```ts
function lazy<P>(
  loader: () => Promise<{ default: (props: P) => VNode }>,
): (props: P) => VNode
```

Creates a lazily loaded component. Must be used with `Suspense`. The loader function is called on first render and cached thereafter.

## ErrorBoundary

```tsx
<ErrorBoundary
  fallback={(error, reset) => (
    <div>
      <p>Error: {error.message}</p>
      <button onClick={reset}>Retry</button>
    </div>
  )}
>
  {children}
</ErrorBoundary>
```

**Props:**
- `fallback` - A function `(error: unknown, reset: () => void) => VNode` called when an error is caught. The `reset` function re-renders the children.
- `children` - The subtree to monitor for errors

### ErrorBoundary + Suspense

Place an `ErrorBoundary` *inside* a `Suspense` boundary to catch errors from lazy-loaded components and rejected promises from `use()`:

```tsx
<Suspense fallback={<p>Loading...</p>}>
  <ErrorBoundary fallback={(err) => <p>Failed: {err.message}</p>}>
    <LazyComponent />
  </ErrorBoundary>
</Suspense>
```

::: info
An `ErrorBoundary` *wrapping* a `Suspense` boundary cannot catch async rejections from lazy components, because the re-render is triggered by the scheduler (no parent error handler on the stack). The `ErrorBoundary`-inside-`Suspense` pattern works correctly.
:::

## Suspense

```tsx
<Suspense fallback={<p>Loading...</p>}>
  {children}
</Suspense>
```

**Props:**
- `fallback` - VNode to render while suspended content is loading
- `children` - The subtree that may suspend (via `lazy` or `use(promise)`)

Suspense works with:
- **`lazy()`** components that are still loading
- **`use(promise)`** calls with pending promises
- **Streaming SSR** with `renderToReadableStream` (sends fallback immediately, swaps in content when ready)
- **Hydration** (handles both streaming placeholders and non-streaming children)

## createPortal

```ts
function createPortal(children: VNode, container: Element): VNode
```

Renders children into a DOM node outside the component's parent hierarchy. Events still bubble through the Tachys tree (not the DOM tree).

## createRef

```ts
function createRef<T = unknown>(): RefObject<T>
```

Creates a `{ current: null }` ref object. Prefer `useRef` inside components.

## StrictMode

Imported from `tachys/compat`.

```tsx
import { StrictMode } from "tachys/compat"

<StrictMode>
  {children}
</StrictMode>
```

No-op passthrough in Tachys. In React, `StrictMode` double-invokes render functions and enables additional development warnings. Exported so that `<StrictMode>` usage in third-party code does not break when aliased to `tachys/compat`.

## Profiler

Imported from `tachys/compat`.

```tsx
import { Profiler } from "tachys/compat"

<Profiler id="MyComponent" onRender={onRenderCallback}>
  {children}
</Profiler>
```

**Props:**
- `id` - Identifies the part of the tree being profiled
- `onRender` - Callback invoked after the profiled subtree commits

No-op passthrough in Tachys. In React, `Profiler` measures rendering performance and calls `onRender` with timing data. Exported so that `<Profiler>` usage in third-party code does not break when aliased to `tachys/compat`.
