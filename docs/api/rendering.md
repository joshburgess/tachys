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

## flushUpdates

```ts
function flushUpdates(): void
```

Synchronously flush all pending state updates. Normally updates are batched via microtask. Call this in tests or when you need synchronous rendering.
