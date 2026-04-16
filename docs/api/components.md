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
  fallback={<p>Error occurred</p>}
  onError={(error: unknown) => console.error(error)}
  onReset={() => console.log("reset")}
>
  {children}
</ErrorBoundary>
```

**Props:**
- `fallback` - VNode to render when an error is caught
- `onError` (optional) - Called with the caught error
- `onReset` (optional) - Called when the error state is reset
- `children` - The subtree to monitor for errors

## Suspense

```tsx
<Suspense fallback={<p>Loading...</p>}>
  {children}
</Suspense>
```

**Props:**
- `fallback` - VNode to render while suspended content is loading
- `children` - The subtree that may suspend (via `lazy` or `use(promise)`)

## createPortal

```ts
function createPortal(children: VNode, container: Element): VNode
```

Renders children into a DOM node outside the component's parent hierarchy. Events still bubble through the Phasm tree (not the DOM tree).

## createRef

```ts
function createRef<T = unknown>(): RefObject<T>
```

Creates a `{ current: null }` ref object. Prefer `useRef` inside components.
