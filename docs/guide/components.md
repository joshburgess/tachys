# Components

Tachys uses functional components exclusively. There are no class components.

## Basic Component

A component is a function that accepts `props` and returns a VNode:

```tsx
function Greeting(props: { name: string }) {
  return <h1>Hello, {props.name}!</h1>
}

// Usage
<Greeting name="World" />
```

## Children

Components receive children through the `children` prop:

```tsx
import type { VNode } from "tachys"

function Card(props: { title: string; children?: VNode }) {
  return (
    <div className="card">
      <h2>{props.title}</h2>
      {props.children}
    </div>
  )
}

<Card title="Welcome">
  <p>Card content goes here.</p>
</Card>
```

## Memoization

Wrap a component with `memo` to skip re-renders when props haven't changed:

```tsx
import { memo } from "tachys"

const ExpensiveList = memo(function ExpensiveList(props: { items: string[] }) {
  return (
    <ul>
      {props.items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  )
})
```

Pass a custom comparator as the second argument:

```tsx
const Item = memo(
  function Item(props: { data: { id: number; label: string } }) {
    return <span>{props.data.label}</span>
  },
  (prev, next) => prev.data.id === next.data.id,
)
```

## Forwarding Refs

Use `forwardRef` to pass a ref through to a child DOM element:

```tsx
import { forwardRef } from "tachys"

const FancyInput = forwardRef(function FancyInput(
  props: { placeholder?: string },
  ref: RefObject<HTMLInputElement>,
) {
  return <input ref={ref} placeholder={props.placeholder} />
})
```

## Error Boundaries

Catch rendering errors with `ErrorBoundary`. The `fallback` prop is a function that receives the error and a `reset` function:

```tsx
import { ErrorBoundary } from "tachys"

<ErrorBoundary
  fallback={(error, reset) => (
    <div>
      <p>Something went wrong: {error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  )}
>
  <RiskyComponent />
</ErrorBoundary>
```

## Suspense and Lazy Loading

Load components dynamically with `lazy` and `Suspense`:

```tsx
import { lazy, Suspense } from "tachys"

const HeavyChart = lazy(() => import("./HeavyChart"))

function Dashboard() {
  return (
    <Suspense fallback={<p>Loading chart...</p>}>
      <HeavyChart />
    </Suspense>
  )
}
```

### ErrorBoundary + Suspense

Place an `ErrorBoundary` inside a `Suspense` boundary to catch errors from lazy-loaded components or rejected promises from `use()`:

```tsx
import { lazy, Suspense, ErrorBoundary } from "tachys"

const HeavyChart = lazy(() => import("./HeavyChart"))

function Dashboard() {
  return (
    <Suspense fallback={<p>Loading chart...</p>}>
      <ErrorBoundary
        fallback={(err) => <p>Chart failed to load: {err.message}</p>}
      >
        <HeavyChart />
      </ErrorBoundary>
    </Suspense>
  )
}
```

::: tip
The `ErrorBoundary` must be *inside* the `Suspense` boundary, not wrapping it. This is because async rejections from lazy components trigger a re-render via the scheduler, and only error handlers inside the same Suspense scope can catch them.
:::

## Portals

Render children into a different DOM node:

```tsx
import { createPortal } from "tachys"

function Modal(props: { children?: VNode }) {
  return createPortal(
    <div className="modal-overlay">{props.children}</div>,
    document.getElementById("modal-root")!,
  )
}
```
