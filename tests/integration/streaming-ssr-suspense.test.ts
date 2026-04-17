/**
 * Tests for streaming SSR with Suspense resolution:
 *   - Suspense fallback appears in initial stream
 *   - Resolved content is streamed with swap scripts
 *   - Multiple Suspense boundaries resolve independently
 *   - Nested Suspense boundaries
 *   - Non-suspended content streams immediately
 *   - Hydration after streaming with lazy components
 */

import { describe, expect, it } from "vitest"
import { h, Suspense, lazy, useState, flushUpdates } from "../../src/index"
import { renderToReadableStream, renderToStringAsync, hydrate } from "../../src/server"
import type { VNode } from "../../src/vnode"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function flushMicrotasks(): Promise<void> {
  flushUpdates()
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

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

async function collectChunks(stream: ReadableStream<string>): Promise<string[]> {
  const reader = stream.getReader()
  const chunks: string[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  return chunks
}

function makeSuspender() {
  let resolve: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve: resolve! }
}

// ---------------------------------------------------------------------------
// Streaming SSR with Suspense fallback + resolution
// ---------------------------------------------------------------------------

describe("streaming SSR with Suspense resolution", () => {
  it("streams fallback immediately for suspended component", async () => {
    const { promise, resolve } = makeSuspender()
    let threw = false

    function SlowChild() {
      if (!threw) {
        threw = true
        // Resolve after a delay so the stream can complete
        setTimeout(() => resolve(), 10)
        throw promise
      }
      return h("div", null, "loaded")
    }

    const vnode = h(
      Suspense,
      { fallback: h("span", null, "Loading...") },
      h(SlowChild, null),
    )

    const html = await collectStream(renderToReadableStream(vnode))

    // Should contain the placeholder span with fallback content
    expect(html).toContain('id="ph:')
    expect(html).toContain("Loading...")
  })

  it("includes resolved content when promise settles during streaming", async () => {
    let doResolve: () => void
    const promise = new Promise<void>((resolve) => {
      doResolve = resolve
    })
    let threw = false

    function SlowChild() {
      if (!threw) {
        threw = true
        // Resolve immediately after throwing so it resolves during streaming
        setTimeout(() => doResolve(), 0)
        throw promise
      }
      return h("div", null, "resolved content")
    }

    const vnode = h(
      Suspense,
      { fallback: h("span", null, "Loading...") },
      h(SlowChild, null),
    )

    const html = await collectStream(renderToReadableStream(vnode))

    // Should contain the swap script and resolved content
    expect(html).toContain("resolved content")
    expect(html).toContain("phr:")
    expect(html).toContain("$ph(")
  })

  it("non-suspended content streams without placeholders", async () => {
    function SyncChild() {
      return h("p", null, "immediate")
    }

    const vnode = h(
      Suspense,
      { fallback: h("span", null, "Loading...") },
      h(SyncChild, null),
    )

    const html = await collectStream(renderToReadableStream(vnode))

    // No placeholder needed since child didn't suspend
    expect(html).toBe("<p>immediate</p>")
    expect(html).not.toContain("ph:")
    expect(html).not.toContain("<script>")
  })

  it("multiple independent Suspense boundaries stream and resolve", async () => {
    const s1 = makeSuspender()
    const s2 = makeSuspender()
    let threw1 = false
    let threw2 = false

    function Slow1() {
      if (!threw1) {
        threw1 = true
        setTimeout(() => s1.resolve(), 0)
        throw s1.promise
      }
      return h("div", null, "first")
    }

    function Slow2() {
      if (!threw2) {
        threw2 = true
        setTimeout(() => s2.resolve(), 0)
        throw s2.promise
      }
      return h("div", null, "second")
    }

    const vnode = h(
      "div",
      null,
      h(Suspense, { fallback: h("span", null, "L1") }, h(Slow1, null)),
      h(Suspense, { fallback: h("span", null, "L2") }, h(Slow2, null)),
    )

    const html = await collectStream(renderToReadableStream(vnode))

    expect(html).toContain("first")
    expect(html).toContain("second")
    // Both should have their own phr divs
    expect(html).toContain("phr:0")
    expect(html).toContain("phr:1")
  })

  it("swap script definition is emitted only once for multiple boundaries", async () => {
    const s1 = makeSuspender()
    const s2 = makeSuspender()
    let threw1 = false
    let threw2 = false

    function Slow1() {
      if (!threw1) {
        threw1 = true
        setTimeout(() => s1.resolve(), 0)
        throw s1.promise
      }
      return h("div", null, "a")
    }

    function Slow2() {
      if (!threw2) {
        threw2 = true
        setTimeout(() => s2.resolve(), 0)
        throw s2.promise
      }
      return h("div", null, "b")
    }

    const vnode = h(
      "div",
      null,
      h(Suspense, { fallback: h("span", null, "L1") }, h(Slow1, null)),
      h(Suspense, { fallback: h("span", null, "L2") }, h(Slow2, null)),
    )

    const html = await collectStream(renderToReadableStream(vnode))

    // The $ph function definition should only appear once
    const definitionMatches = html.match(/function \$ph\(id\)/g)
    expect(definitionMatches).not.toBeNull()
    expect(definitionMatches!.length).toBe(1)

    // But the invocation should appear twice
    const invocationMatches = html.match(/\$ph\(\d+\)/g)
    expect(invocationMatches).not.toBeNull()
    expect(invocationMatches!.length).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// renderToStringAsync waits for Suspense
// ---------------------------------------------------------------------------

describe("renderToStringAsync with Suspense", () => {
  it("waits for lazy component to resolve", async () => {
    function Content() {
      return h("div", null, "async content")
    }

    const LazyContent = lazy(() => Promise.resolve({ default: Content }))

    const vnode = h(
      Suspense,
      { fallback: h("span", null, "Loading...") },
      h(LazyContent, null),
    )

    const html = await renderToStringAsync(vnode)

    // Should contain the resolved content, not the fallback
    expect(html).toContain("async content")
    expect(html).not.toContain("Loading...")
  })

  it("waits for deeply nested Suspense to resolve", async () => {
    function Inner() {
      return h("span", null, "deep")
    }

    const LazyInner = lazy(() => Promise.resolve({ default: Inner }))

    const vnode = h(
      "div",
      null,
      h(
        Suspense,
        { fallback: h("span", null, "outer loading") },
        h(
          "div",
          null,
          h(
            Suspense,
            { fallback: h("span", null, "inner loading") },
            h(LazyInner, null),
          ),
        ),
      ),
    )

    const html = await renderToStringAsync(vnode)
    expect(html).toContain("deep")
  })
})

// ---------------------------------------------------------------------------
// Full roundtrip: stream -> hydrate -> interactive
// ---------------------------------------------------------------------------

describe("stream -> hydrate roundtrip", () => {
  it("hydrates streamed content with event handlers", async () => {
    const onClick = { fn: () => {} }

    function App() {
      return h("button", { onClick: onClick.fn }, "Click me")
    }

    const stream = renderToReadableStream(h(App, null))
    const html = await collectStream(stream)

    const container = document.createElement("div")
    container.innerHTML = html

    let clicked = false
    onClick.fn = () => {
      clicked = true
    }

    hydrate(h(App, null), container)

    container.querySelector("button")!.click()
    expect(clicked).toBe(true)
  })

  it("hydrates content after streaming Suspense resolves", async () => {
    function Content() {
      return h("p", null, "streamed")
    }

    // The actual app tree after lazy resolves
    const vnode = h(
      Suspense,
      { fallback: h("span", null, "Loading...") },
      h(Content, null),
    )

    // Simulate post-streaming DOM (swap already happened)
    const container = document.createElement("div")
    container.innerHTML = "<p>streamed</p>"

    hydrate(vnode, container)
    expect(container.innerHTML).toBe("<p>streamed</p>")
  })

  it("stateful components work after streaming + hydration", async () => {
    let setter: ((v: number) => void) | null = null

    function Counter() {
      const [count, setCount] = useState(0)
      setter = setCount
      return h("span", null, String(count))
    }

    const vnode = h(
      Suspense,
      { fallback: h("div", null, "Loading") },
      h(Counter, null),
    )

    // Simulate SSR output (Suspense rendered synchronously)
    const container = document.createElement("div")
    container.innerHTML = "<span>0</span>"

    hydrate(vnode, container)
    expect(container.innerHTML).toBe("<span>0</span>")

    setter!(42)
    flushUpdates()
    expect(container.innerHTML).toBe("<span>42</span>")
  })
})
