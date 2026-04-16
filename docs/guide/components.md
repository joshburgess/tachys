# Components

Phasm uses functional components exclusively. There are no class components.

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
import type { VNode } from "phasm"

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
import { memo } from "phasm"

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
import { forwardRef } from "phasm"

const FancyInput = forwardRef(function FancyInput(
  props: { placeholder?: string },
  ref: RefObject<HTMLInputElement>,
) {
  return <input ref={ref} placeholder={props.placeholder} />
})
```

## Error Boundaries

Catch rendering errors with `ErrorBoundary`:

```tsx
import { ErrorBoundary } from "phasm"

<ErrorBoundary fallback={<p>Something went wrong.</p>}>
  <RiskyComponent />
</ErrorBoundary>
```

## Suspense and Lazy Loading

Load components dynamically with `lazy` and `Suspense`:

```tsx
import { lazy, Suspense } from "phasm"

const HeavyChart = lazy(() => import("./HeavyChart"))

function Dashboard() {
  return (
    <Suspense fallback={<p>Loading chart...</p>}>
      <HeavyChart />
    </Suspense>
  )
}
```

## Portals

Render children into a different DOM node:

```tsx
import { createPortal } from "phasm"

function Modal(props: { children?: VNode }) {
  return createPortal(
    <div className="modal-overlay">{props.children}</div>,
    document.getElementById("modal-root")!,
  )
}
```
