# Rendering API

## render

```ts
function render(vnode: VNode | null, container: Element): void
```

Render a VNode tree into a DOM container. On first call, mounts the tree. On subsequent calls, diffs against the previous tree and applies minimal DOM mutations. Pass `null` to unmount.

```ts
import { render, h } from "phasm"

render(h("div", null, "Hello"), document.getElementById("app")!)

// Update
render(h("div", null, "World"), document.getElementById("app")!)

// Unmount
render(null, document.getElementById("app")!)
```

## createRoot

```ts
interface Root {
  render(children: VNode): void
  unmount(): void
}

function createRoot(container: Element): Root
```

Creates a concurrent root for the given DOM container and returns a `Root` object. This is the React 18+ root API. Call `root.render()` to mount or update the tree, and `root.unmount()` to tear it down.

```ts
import { createRoot, h } from "phasm"

const root = createRoot(document.getElementById("app")!)
root.render(h("div", null, "Hello"))

// Update
root.render(h("div", null, "World"))

// Tear down
root.unmount()
```

## hydrateRoot

```ts
function hydrateRoot(container: Element, initialChildren: VNode): Root
```

Hydrates server-rendered HTML in `container` using `initialChildren` as the expected VNode tree, then returns a `Root` for subsequent updates. Reuses existing DOM nodes where possible instead of replacing them.

```ts
import { hydrateRoot, h } from "phasm"

const root = hydrateRoot(document.getElementById("app")!, h(App, null))
root.render(h(App, null))
```

## mount

```ts
function mount(vnode: VNode, parentDom: Element): void
```

Lower-level mount that attaches a VNode tree to a DOM element. Does not track previous trees for diffing. Use `render` for most cases.

## patch

```ts
function patch(oldVNode: VNode, newVNode: VNode, parentDom: Element): void
```

Diff an existing VNode tree against a new one and apply minimal DOM mutations.

## unmount

```ts
function unmount(vnode: VNode): void
```

Unmount a VNode tree, cleaning up event listeners, refs, component instances, and returning VNodes to the pool.

## h

```ts
function h(
  type: string | ComponentFn | null,
  props: Record<string, unknown> | null,
  ...children: Array<VNode | string | number | boolean | null | undefined>
): VNode
```

Create a VNode. This is the classic hyperscript / `createElement` API.

```ts
// Element
h("div", { className: "box" }, "Hello")

// Component
h(MyComponent, { name: "World" })

// Fragment
h(null, null, h("li", null, "A"), h("li", null, "B"))

// Nested
h("ul", null, h("li", null, "One"), h("li", null, "Two"))
```

## createTextVNode

```ts
function createTextVNode(text: string): VNode
```

Create a text VNode directly.

## Scheduler

### Lane

```ts
const Lane = { Sync: 0, Default: 1, Transition: 2 } as const
```

Priority lanes for the scheduler:

| Lane | Value | Description |
|------|-------|-------------|
| `Sync` | `0` | Highest priority. Used by `useSyncExternalStore` for tearing prevention. |
| `Default` | `1` | Normal state updates from `useState`, `useReducer`. |
| `Transition` | `2` | Low priority. Used by `startTransition`, `useTransition`, `useDeferredValue`. |

### flushUpdates

```ts
function flushUpdates(): void
```

Synchronously flush all pending state updates across all lanes. Normally updates are batched via microtask. Call this in tests or when you need synchronous rendering.

### flushSyncWork

```ts
function flushSyncWork(): void
```

Flush only the Sync lane. Useful when you need to ensure `useSyncExternalStore` updates are processed before other work.

### shouldYield

```ts
function shouldYield(): boolean
```

Returns `true` if the current time slice (~5ms) has expired. Used internally by the work loop.

## act

```ts
async function act(callback: () => void | Promise<void>): Promise<void>
```

Testing utility that wraps a callback triggering state updates and synchronously flushes all pending work, including microtasks and async effects. Compatible with React Testing Library's `act()` usage.

::: info
`act` is imported from `phasm/compat`, not the core `phasm` package.
:::

```ts
import { act } from "phasm/compat"
import { render, h } from "phasm"

await act(async () => {
  render(h(MyComponent, null), container)
})
// DOM is fully updated here
```
