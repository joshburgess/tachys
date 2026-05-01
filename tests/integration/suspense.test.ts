import { describe, expect, it, vi } from "vitest"
import { Suspense, flushUpdates, h, lazy, mount, patch, unmount, useState } from "../../src/index"
import type { VNode } from "../../src/vnode"
import type { ComponentFn } from "../../src/vnode"

function flushMicrotasks(): Promise<void> {
  flushUpdates()
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

// Helper to create a controllable lazy loader
function createLazyLoader(component: ComponentFn) {
  let resolvePromise: (() => void) | null = null
  const loader = () =>
    new Promise<{ default: ComponentFn }>((resolve) => {
      resolvePromise = () => resolve({ default: component })
    })
  return {
    loader,
    resolve: () => {
      resolvePromise!()
    },
  }
}

// Helper to create an immediately-resolving lazy loader
function createResolvedLazyLoader(component: ComponentFn) {
  return () => Promise.resolve({ default: component })
}

// ---------------------------------------------------------------------------
// lazy()
// ---------------------------------------------------------------------------

describe("lazy", () => {
  it("renders the loaded component after promise resolves", async () => {
    const container = document.createElement("div")

    function Greeting() {
      return h("span", null, "Hello!")
    }

    const LazyGreeting = lazy(createResolvedLazyLoader(Greeting))

    const vnode = h(Suspense, { fallback: h("div", null, "Loading...") }, h(LazyGreeting, null))

    mount(vnode, container)
    // Initially shows fallback
    expect(container.innerHTML).toBe("<div>Loading...</div>")

    // Wait for the lazy module to resolve
    await flushMicrotasks()
    flushUpdates()
    await flushMicrotasks()
    flushUpdates()

    expect(container.innerHTML).toBe("<span>Hello!</span>")
  })

  it("shows fallback while loading, then transitions to content", async () => {
    const container = document.createElement("div")

    function Content() {
      return h("div", null, "Loaded content")
    }

    const { loader, resolve } = createLazyLoader(Content)
    const LazyContent = lazy(loader)

    mount(h(Suspense, { fallback: h("span", null, "Loading...") }, h(LazyContent, null)), container)

    expect(container.innerHTML).toBe("<span>Loading...</span>")

    // Resolve the lazy import
    resolve()
    await flushMicrotasks()
    flushUpdates()
    await flushMicrotasks()
    flushUpdates()

    expect(container.innerHTML).toBe("<div>Loaded content</div>")
  })

  it("passes props to the loaded component", async () => {
    const container = document.createElement("div")

    function NameTag(props: Record<string, unknown>) {
      return h("span", null, `Name: ${props["name"]}`)
    }

    const LazyNameTag = lazy(createResolvedLazyLoader(NameTag))

    mount(
      h(Suspense, { fallback: h("div", null, "...") }, h(LazyNameTag, { name: "Alice" })),
      container,
    )

    await flushMicrotasks()
    flushUpdates()
    await flushMicrotasks()
    flushUpdates()

    expect(container.innerHTML).toBe("<span>Name: Alice</span>")
  })

  it("sets rejected state after load failure", async () => {
    const container = document.createElement("div")

    const LazyBroken = lazy(() => Promise.reject(new Error("Network error")))

    mount(h(Suspense, { fallback: h("span", null, "Loading...") }, h(LazyBroken, null)), container)

    // Initially shows Suspense fallback
    expect(container.innerHTML).toBe("<span>Loading...</span>")

    // After rejection, the lazy component will throw a regular error on re-render.
    // Without an ErrorBoundary, the Suspense fallback remains since the re-render
    // error is caught by renderComponent and returns an empty text node.
    await flushMicrotasks()
    flushUpdates()
    await flushMicrotasks()
    flushUpdates()

    // The re-render attempted to show the lazy component, which threw.
    // renderComponent catches and returns an empty placeholder.
    // Suspense is no longer in "loading" state, so it renders the (now empty) child.
    expect(container.textContent).toBe("")
  })

  it("caches the resolved module across re-renders", async () => {
    const container = document.createElement("div")
    let renderCount = 0

    function Counter() {
      renderCount++
      return h("span", null, `rendered ${renderCount}`)
    }

    const LazyCounter = lazy(createResolvedLazyLoader(Counter))

    const vnode1 = h(Suspense, { fallback: h("div", null, "...") }, h(LazyCounter, null))
    mount(vnode1, container)

    await flushMicrotasks()
    flushUpdates()
    await flushMicrotasks()
    flushUpdates()

    expect(container.innerHTML).toBe("<span>rendered 1</span>")

    // Patch with the same lazy component -- should render immediately (no fallback)
    const vnode2 = h(Suspense, { fallback: h("div", null, "...") }, h(LazyCounter, null))
    patch(vnode1, vnode2, container)

    // Should render immediately since the module is already cached
    expect(container.innerHTML).toBe("<span>rendered 2</span>")
  })
})

// ---------------------------------------------------------------------------
// Suspense
// ---------------------------------------------------------------------------

describe("Suspense", () => {
  it("renders children when nothing is suspended", () => {
    const container = document.createElement("div")

    function Child() {
      return h("p", null, "No suspension")
    }

    mount(h(Suspense, { fallback: h("div", null, "Loading") }, h(Child, null)), container)

    expect(container.innerHTML).toBe("<p>No suspension</p>")
  })

  it("renders empty when no fallback is provided and children suspend", async () => {
    const container = document.createElement("div")

    const { loader } = createLazyLoader(() => h("div", null))
    const LazyComp = lazy(loader)

    mount(h(Suspense, null, h(LazyComp, null)), container)

    // No fallback prop -- should show empty placeholder
    expect(container.textContent).toBe("")
  })

  it("renders children when fallback is not needed", () => {
    const container = document.createElement("div")

    mount(
      h(Suspense, { fallback: h("span", null, "fallback") }, h("div", null, "content")),
      container,
    )

    expect(container.innerHTML).toBe("<div>content</div>")
  })

  it("handles multiple children", () => {
    const container = document.createElement("div")

    function A() {
      return h("span", null, "A")
    }
    function B() {
      return h("span", null, "B")
    }

    mount(h(Suspense, { fallback: h("div", null, "Loading") }, h(A, null), h(B, null)), container)

    expect(container.innerHTML).toBe("<span>A</span><span>B</span>")
  })

  it("transitions from fallback to content when lazy resolves", async () => {
    const container = document.createElement("div")
    const states: string[] = []

    function Content() {
      return h("div", null, "Ready")
    }

    const { loader, resolve } = createLazyLoader(Content)
    const LazyContent = lazy(loader)

    mount(h(Suspense, { fallback: h("div", null, "Wait...") }, h(LazyContent, null)), container)

    states.push(container.innerHTML)

    resolve()
    await flushMicrotasks()
    flushUpdates()
    await flushMicrotasks()
    flushUpdates()

    states.push(container.innerHTML)

    expect(states).toEqual(["<div>Wait...</div>", "<div>Ready</div>"])
  })
})
