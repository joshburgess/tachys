# Hooks

Phasm implements all standard React hooks with the same API.

## useState

Declare a state variable:

```tsx
import { useState } from "phasm"

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
import { useReducer } from "phasm"

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
import { useState, useEffect } from "phasm"

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
In Phasm, `useEffect` and `useLayoutEffect` are identical -- both run synchronously after the render commits to the DOM.
:::

## useMemo

Memoize expensive computations:

```tsx
import { useMemo } from "phasm"

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
import { useCallback } from "phasm"

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
import { useRef, useEffect } from "phasm"

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
import { useId } from "phasm"

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
import { forwardRef, useImperativeHandle, useRef } from "phasm"

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

Subscribe to an external store:

```tsx
import { useSyncExternalStore } from "phasm"

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
