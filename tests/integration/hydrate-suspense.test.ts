/**
 * Tests for hydrating Suspense boundaries, including:
 *   - Basic Suspense hydration (non-streaming, children rendered synchronously)
 *   - Streaming SSR placeholder cleanup
 *   - Hydrating after swap scripts have run
 *   - Lazy components that haven't loaded yet during hydration
 *   - Event handler attachment on hydrated Suspense content
 */

import { describe, expect, it, vi } from "vitest"
import { h, Suspense, useState, flushUpdates, lazy } from "../../src/index"
import { renderToString, renderToReadableStream, hydrate } from "../../src/server"
import type { VNode } from "../../src/vnode"
import type { ComponentFn } from "../../src/vnode"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function flushMicrotasks(): Promise<void> {
  flushUpdates()
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

/** Collect all chunks from a ReadableStream into a single string. */
async function collectStream(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader()
  let result = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    result += value
  }
  return result
}

// ---------------------------------------------------------------------------
// Basic Suspense hydration (synchronous SSR, no streaming)
// ---------------------------------------------------------------------------

describe("hydrate Suspense (non-streaming)", () => {
  it("hydrates children that rendered synchronously inside Suspense", () => {
    function Child() {
      return h("span", null, "loaded content")
    }

    const vnode = h(
      Suspense,
      { fallback: h("div", null, "Loading...") },
      h(Child, null),
    )

    const html = renderToString(vnode)
    const container = document.createElement("div")
    container.innerHTML = html
    expect(container.innerHTML).toBe("<span>loaded content</span>")

    hydrate(vnode, container)

    // After hydration, content should be preserved
    expect(container.innerHTML).toBe("<span>loaded content</span>")
  })

  it("attaches event handlers inside Suspense children", () => {
    const onClick = vi.fn()

    function Child() {
      return h("button", { onClick }, "Click me")
    }

    const ssrVNode = h(
      Suspense,
      { fallback: h("div", null, "Loading...") },
      h(Child, null),
    )

    const html = renderToString(ssrVNode)
    const container = document.createElement("div")
    container.innerHTML = html

    const hydrateVNode = h(
      Suspense,
      { fallback: h("div", null, "Loading...") },
      h(Child, null),
    )
    hydrate(hydrateVNode, container)

    container.querySelector("button")!.click()
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it("preserves Suspense fallback DOM when child hasn't loaded", async () => {
    function Content() {
      return h("div", null, "Ready")
    }

    const LazyContent = lazy(() => Promise.resolve({ default: Content }))

    // SSR renders the fallback (lazy component suspends during SSR)
    // With renderToString (non-async), lazy throws and returns empty
    const ssrVNode = h(
      Suspense,
      { fallback: h("span", null, "Loading...") },
      h("span", null, "Loading..."), // Simulate fallback HTML from SSR
    )

    const container = document.createElement("div")
    container.innerHTML = "<span>Loading...</span>"

    // Hydrate with the actual Suspense + lazy tree
    const hydrateVNode = h(
      Suspense,
      { fallback: h("span", null, "Loading...") },
      h(LazyContent, null),
    )

    hydrate(hydrateVNode, container)

    // After microtasks, lazy resolves and Suspense re-renders
    await flushMicrotasks()
    flushUpdates()
    await flushMicrotasks()
    flushUpdates()

    expect(container.innerHTML).toBe("<div>Ready</div>")
  })
})

// ---------------------------------------------------------------------------
// Streaming SSR cleanup during hydration
// ---------------------------------------------------------------------------

describe("hydrate streaming SSR artifacts", () => {
  it("removes swap script elements during hydration", () => {
    const container = document.createElement("div")
    container.innerHTML =
      '<span>content</span>' +
      '<script>function $ph(id){}</script>' +
      '<script>$ph(0)</script>'

    const vnode = h("span", null, "content")
    hydrate(vnode, container)

    // Scripts should be removed
    expect(container.querySelectorAll("script").length).toBe(0)
    expect(container.innerHTML).toBe("<span>content</span>")
  })

  it("removes hidden phr:N divs during hydration", () => {
    const container = document.createElement("div")
    container.innerHTML =
      '<span>resolved content</span>' +
      '<div hidden id="phr:0"><span>old</span></div>'

    const vnode = h("span", null, "resolved content")
    hydrate(vnode, container)

    // Hidden div should be removed
    expect(container.querySelector("[id^='phr:']")).toBeNull()
    expect(container.innerHTML).toBe("<span>resolved content</span>")
  })

  it("removes $ph: comment nodes during hydration", () => {
    const container = document.createElement("div")
    container.innerHTML = "<!--$ph:0--><span>content</span>"

    const vnode = h("span", null, "content")
    hydrate(vnode, container)

    // Comment should be removed
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_COMMENT)
    expect(walker.nextNode()).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Hydrating after streaming swap has completed
// ---------------------------------------------------------------------------

describe("hydrate after streaming swap", () => {
  it("hydrates resolved Suspense content after swap script ran", async () => {
    function SlowChild() {
      return h("div", null, "resolved!")
    }

    // Simulate what happens after streaming SSR:
    // 1. Server sends fallback in ph:0 span
    // 2. Server sends resolved content in phr:0 div + swap script
    // 3. Swap script replaces ph:0 with resolved content
    // After swap, the DOM looks like the resolved content is in place.
    const container = document.createElement("div")
    container.innerHTML = "<div>resolved!</div>"

    // Hydrate with the Suspense tree (children are now synchronous)
    const vnode = h(
      Suspense,
      { fallback: h("span", null, "loading...") },
      h(SlowChild, null),
    )

    hydrate(vnode, container)
    expect(container.innerHTML).toBe("<div>resolved!</div>")
  })

  it("attaches event handlers to swapped-in content", () => {
    const onClick = vi.fn()

    function SlowChild() {
      return h("button", { onClick }, "Click")
    }

    // Simulate post-swap DOM
    const container = document.createElement("div")
    container.innerHTML = "<button>Click</button>"

    const vnode = h(
      Suspense,
      { fallback: h("span", null, "loading...") },
      h(SlowChild, null),
    )

    hydrate(vnode, container)

    container.querySelector("button")!.click()
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Streaming SSR integration: renderToReadableStream -> hydrate
// ---------------------------------------------------------------------------

describe("renderToReadableStream -> hydrate roundtrip", () => {
  it("produces valid HTML that can be hydrated (no Suspense)", async () => {
    function App() {
      return h("div", null, h("span", null, "hello"))
    }

    const stream = renderToReadableStream(h(App, null))
    const html = await collectStream(stream)

    const container = document.createElement("div")
    container.innerHTML = html

    hydrate(h(App, null), container)
    expect(container.innerHTML).toBe("<div><span>hello</span></div>")
  })

  it("cleans up streaming artifacts and hydrates correctly", async () => {
    function App() {
      return h("div", null, h("p", null, "content"))
    }

    const stream = renderToReadableStream(h(App, null))
    const html = await collectStream(stream)

    const container = document.createElement("div")
    container.innerHTML = html

    hydrate(h(App, null), container)

    // No scripts or hidden divs should remain
    expect(container.querySelectorAll("script").length).toBe(0)
    expect(container.querySelectorAll("div[hidden]").length).toBe(0)
    expect(container.innerHTML).toBe("<div><p>content</p></div>")
  })
})

// ---------------------------------------------------------------------------
// Stateful components survive hydration
// ---------------------------------------------------------------------------

describe("stateful components after hydration", () => {
  it("useState works after hydrating inside Suspense", () => {
    let setter: ((v: number) => void) | null = null

    function Counter() {
      const [count, setCount] = useState(0)
      setter = setCount
      return h("span", null, String(count))
    }

    const container = document.createElement("div")
    container.innerHTML = "<span>0</span>"

    const vnode = h(
      Suspense,
      { fallback: h("div", null, "Loading") },
      h(Counter, null),
    )

    hydrate(vnode, container)
    expect(container.innerHTML).toBe("<span>0</span>")

    // State updates should work after hydration
    setter!(5)
    flushUpdates()
    expect(container.innerHTML).toBe("<span>5</span>")
  })
})
