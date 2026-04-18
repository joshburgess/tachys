# Hooks

Tachys implements all standard React hooks with the same API.

## useState

Declare a state variable:

```tsx
import { useState } from "tachys"

function Counter() {
  const [count, setCount] = useState(0)

  return (
    <button onClick={() => setCount(count + 1)}>
      Clicked {count} times
    </button>
  )
}
```

The setter accepts a value or an updater function:

```tsx
setCount(42)
setCount((prev) => prev + 1)
```

## useReducer

For complex state logic, use a reducer:

```tsx
import { useReducer } from "tachys"

type Action = { type: "increment" } | { type: "decrement" }

function reducer(state: number, action: Action): number {
  switch (action.type) {
    case "increment": return state + 1
    case "decrement": return state - 1
  }
}

function Counter() {
  const [count, dispatch] = useReducer(reducer, 0)
  return (
    <div>
      <span>{count}</span>
      <button onClick={() => dispatch({ type: "increment" })}>+</button>
      <button onClick={() => dispatch({ type: "decrement" })}>-</button>
    </div>
  )
}
```

## useEffect

Run side effects after render:

```tsx
import { useState, useEffect } from "tachys"

function Timer() {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id) // cleanup
  }, []) // empty deps = run once

  return <span>{seconds}s elapsed</span>
}
```

::: info
In Tachys, `useEffect` and `useLayoutEffect` are identical -- both run synchronously after the render commits to the DOM.
:::

## useMemo

Memoize expensive computations:

```tsx
import { useMemo } from "tachys"

function FilteredList(props: { items: string[]; query: string }) {
  const filtered = useMemo(
    () => props.items.filter((item) => item.includes(props.query)),
    [props.items, props.query],
  )

  return <ul>{filtered.map((item) => <li key={item}>{item}</li>)}</ul>
}
```

## useCallback

Memoize a callback reference (shorthand for `useMemo(() => fn, deps)`):

```tsx
import { useCallback } from "tachys"

function SearchBox(props: { onSearch: (q: string) => void }) {
  const handleInput = useCallback(
    (e: Event) => props.onSearch((e.target as HTMLInputElement).value),
    [props.onSearch],
  )

  return <input onInput={handleInput} />
}
```

## useRef

Create a mutable ref that persists across renders:

```tsx
import { useRef, useEffect } from "tachys"

function AutoFocus() {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return <input ref={inputRef} />
}
```

## useId

Generate a unique ID stable across server and client:

```tsx
import { useId } from "tachys"

function LabeledInput(props: { label: string }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id}>{props.label}</label>
      <input id={id} />
    </div>
  )
}
```

## useContext

See the [Context guide](/guide/context).

## useImperativeHandle

Customize the value exposed to parent refs:

```tsx
import { forwardRef, useImperativeHandle, useRef } from "tachys"

const FancyInput = forwardRef(function FancyInput(props, ref) {
  const inputRef = useRef<HTMLInputElement>(null)

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    clear: () => { if (inputRef.current) inputRef.current.value = "" },
  }), [])

  return <input ref={inputRef} />
})
```

## useSyncExternalStore

Subscribe to an external store with tearing prevention. Updates are scheduled at `Lane.Sync` priority:

```tsx
import { useSyncExternalStore } from "tachys"

function WindowWidth() {
  const width = useSyncExternalStore(
    (notify) => {
      window.addEventListener("resize", notify)
      return () => window.removeEventListener("resize", notify)
    },
    () => window.innerWidth,
  )

  return <span>Window width: {width}px</span>
}
```

The optional third parameter `getServerSnapshot` provides a snapshot for SSR:

```tsx
const width = useSyncExternalStore(subscribe, getSnapshot, () => 1024)
```

## useTransition

Mark state updates as non-urgent. Updates inside `startTransition` are scheduled at `Lane.Transition` priority, so higher-priority updates (Sync, Default) process first:

```tsx
import { useState, useTransition } from "tachys"

function Search() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<string[]>([])
  const [isPending, startTransition] = useTransition()

  function handleInput(e: Event) {
    const value = (e.target as HTMLInputElement).value
    setQuery(value) // urgent: update the input immediately

    startTransition(() => {
      setResults(filterItems(value)) // non-urgent: can be deferred
    })
  }

  return (
    <div>
      <input value={query} onInput={handleInput} />
      {isPending ? <p>Searching...</p> : <ResultsList items={results} />}
    </div>
  )
}
```

### Two-phase commit

Transition-lane renders use a two-phase commit: the render phase collects DOM mutations into a queue, then the commit phase flushes them atomically. This means large Transition work is interruptible without leaving the DOM in a half-updated state.

### Abandonment

If a higher-priority update (Sync or Default) arrives while a Transition is still rendering, the Transition is abandoned. The collected DOM effects are discarded, and any hook state or ref callbacks that ran during the abandoned render are rolled back to their pre-Transition values. The higher-priority update then runs against the original state.

### Suspense + Transition

If a component throws a promise during a Transition render (for example, `use(somePromise)` or a `lazy()` load), Tachys does not commit the Suspense fallback. Instead, the scheduler suspends the Transition and retries when the promise resolves. Users do not see intermediate loading states for work that was already showing valid content.

## useDeferredValue

Defer a value so urgent renders are not blocked:

```tsx
import { useState, useDeferredValue } from "tachys"

function SearchResults(props: { query: string }) {
  const deferredQuery = useDeferredValue(props.query)
  const results = filterItems(deferredQuery) // computed with deferred value

  return <ul>{results.map((r) => <li key={r}>{r}</li>)}</ul>
}
```

You can pass an optional `initialValue` (React 19) for the first render, before the deferred value has caught up:

```tsx
const deferredQuery = useDeferredValue(props.query, "")
```

## use

The `use()` hook reads Promises or Context values. Unlike other hooks, it can be called conditionally:

```tsx
import { use, Suspense } from "tachys"

// With context (can be inside conditionals)
function ThemedButton(props: { useTheme: boolean }) {
  const theme = props.useTheme ? use(ThemeContext) : "default"
  return <button className={theme}>Click</button>
}

// With a Promise (must be inside Suspense)
function UserProfile(props: { userPromise: Promise<User> }) {
  const user = use(props.userPromise)
  return <h1>{user.name}</h1>
}

// Usage:
<Suspense fallback={<p>Loading...</p>}>
  <UserProfile userPromise={fetchUser(id)} />
</Suspense>
```

When `use()` receives a pending Promise, it suspends the component until the Promise resolves. The resolved value is cached for subsequent renders. If the Promise rejects, the error can be caught by an `ErrorBoundary` inside the `Suspense` boundary.
