/**
 * Tests for async Suspense-aware SSR.
 *
 * Covers:
 * - renderToStringAsync with Suspense boundaries
 * - renderToReadableStream with out-of-order Suspense streaming
 * - Nested Suspense boundaries
 * - Multiple concurrent suspended components
 */

import { describe, expect, it } from "vitest"
import { Suspense, h, lazy, useState } from "../../src/index"
import { renderToReadableStream, renderToString, renderToStringAsync } from "../../src/server"
import type { VNode } from "../../src/vnode"
import type { ComponentFn } from "../../src/vnode"

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

/**
 * Create a component that suspends (throws a Promise) on first render
 * and resolves to the given content on subsequent renders.
 */
function createSuspendingComponent(
  content: string,
  delay = 0,
): { component: ComponentFn; resolve: () => void } {
  let resolved = false
  let resolver: (() => void) | null = null
  const promise = new Promise<void>((res) => {
    resolver = () => {
      resolved = true
      res()
    }
  })

  // Auto-resolve after delay if specified
  if (delay > 0) {
    setTimeout(() => resolver!(), delay)
  }

  const component: ComponentFn = () => {
    if (!resolved) throw promise
    return h("span", null, content)
  }
  component.displayName = `Suspending(${content})`

  return { component, resolve: resolver! }
}

/**
 * Create a lazy()-like component from a sync function with a controlled delay.
 */
function createLazyComponent(Comp: ComponentFn, delay = 10): ComponentFn & { displayName: string } {
  return lazy(
    () =>
      new Promise<{ default: ComponentFn }>((resolve) => {
        setTimeout(() => resolve({ default: Comp }), delay)
      }),
  )
}

// ---------------------------------------------------------------------------
// renderToStringAsync
// ---------------------------------------------------------------------------

describe("renderToStringAsync", () => {
  it("renders non-suspended content identically to renderToString", async () => {
    function App() {
      return h("div", { className: "app" }, h("span", null, "Hello"))
    }

    const sync = renderToString(h(App, null))
    const async_ = await renderToStringAsync(h(App, null))
    expect(async_).toBe(sync)
  })

  it("renders components with useState", async () => {
    function Counter() {
      const [count] = useState(42)
      return h("span", null, String(count))
    }

    const html = await renderToStringAsync(h(Counter, null))
    expect(html).toBe("<span>42</span>")
  })

  it("awaits a suspended component inside Suspense", async () => {
    const { component: Slow, resolve } = createSuspendingComponent("loaded")

    function App() {
      return h(Suspense, { fallback: h("div", null, "Loading...") }, h(Slow, null))
    }

    const promise = renderToStringAsync(h(App, null))
    // Resolve the suspended component
    resolve()

    const html = await promise
    expect(html).toBe("<span>loaded</span>")
    expect(html).not.toContain("Loading")
  })

  it("awaits a lazy component inside Suspense", async () => {
    function Greeting() {
      return h("b", null, "Hi there!")
    }

    const LazyGreeting = createLazyComponent(Greeting, 5)

    function App() {
      return h(Suspense, { fallback: h("span", null, "Loading...") }, h(LazyGreeting, null))
    }

    const html = await renderToStringAsync(h(App, null))
    expect(html).toBe("<b>Hi there!</b>")
  })

  it("handles nested Suspense boundaries", async () => {
    const { component: SlowOuter, resolve: resolveOuter } = createSuspendingComponent("outer")
    const { component: SlowInner, resolve: resolveInner } = createSuspendingComponent("inner")

    function App() {
      return h(
        "div",
        null,
        h(Suspense, { fallback: h("span", null, "Loading outer") }, h(SlowOuter, null)),
        h(Suspense, { fallback: h("span", null, "Loading inner") }, h(SlowInner, null)),
      )
    }

    const promise = renderToStringAsync(h(App, null))
    resolveOuter()
    resolveInner()

    const html = await promise
    expect(html).toContain("<span>outer</span>")
    expect(html).toContain("<span>inner</span>")
    expect(html).not.toContain("Loading")
  })

  it("handles Suspense with no fallback", async () => {
    const { component: Slow, resolve } = createSuspendingComponent("content")

    function App() {
      return h(Suspense, null, h(Slow, null))
    }

    const promise = renderToStringAsync(h(App, null))
    resolve()

    const html = await promise
    expect(html).toBe("<span>content</span>")
  })

  it("renders fallback if max retries exhausted", async () => {
    // A component that never resolves (the promise resolves but the
    // component keeps throwing new promises)
    let throwCount = 0
    const NeverReady: ComponentFn = () => {
      throwCount++
      throw new Promise<void>((r) => setTimeout(r, 0))
    }

    function App() {
      return h(Suspense, { fallback: h("span", null, "fallback") }, h(NeverReady, null))
    }

    const html = await renderToStringAsync(h(App, null))
    // After max retries, should render fallback
    expect(html).toBe("<span>fallback</span>")
    expect(throwCount).toBeGreaterThan(1)
  })

  it("handles mixed sync and async children", async () => {
    const { component: Slow, resolve } = createSuspendingComponent("async-part")

    function SyncPart() {
      return h("span", null, "sync-part")
    }

    function App() {
      return h(
        "div",
        null,
        h(SyncPart, null),
        h(Suspense, { fallback: h("span", null, "...") }, h(Slow, null)),
      )
    }

    const promise = renderToStringAsync(h(App, null))
    resolve()

    const html = await promise
    expect(html).toBe("<div><span>sync-part</span><span>async-part</span></div>")
  })
})

// ---------------------------------------------------------------------------
// renderToReadableStream with Suspense
// ---------------------------------------------------------------------------

describe("renderToReadableStream with Suspense", () => {
  it("streams non-suspended content normally", async () => {
    function App() {
      return h("div", null, h("span", null, "hello"))
    }

    const html = await collectStream(renderToReadableStream(h(App, null)))
    expect(html).toBe("<div><span>hello</span></div>")
  })

  it("emits fallback HTML for suspended components then streams resolved content", async () => {
    // Create a component that suspends with a microtask-resolved promise.
    // The promise resolves between the synchronous walk and the pending loop.
    let resolved = false
    const promise = Promise.resolve().then(() => {
      resolved = true
    })
    const Slow: ComponentFn = () => {
      if (!resolved) throw promise
      return h("span", null, "loaded")
    }

    function App() {
      return h(Suspense, { fallback: h("span", null, "Loading...") }, h(Slow, null))
    }

    const html = await collectStream(renderToReadableStream(h(App, null)))
    // Should contain the fallback in a placeholder
    expect(html).toContain("Loading...")
    // Should also contain the resolved content
    expect(html).toContain("loaded")
    // Should have the swap script
    expect(html).toContain("$ph(")
  })

  it("includes swap script exactly once for multiple boundaries", async () => {
    let r1 = false
    let r2 = false
    const p1 = Promise.resolve().then(() => {
      r1 = true
    })
    const p2 = Promise.resolve().then(() => {
      r2 = true
    })

    const Slow1: ComponentFn = () => {
      if (!r1) throw p1
      return h("span", null, "first")
    }
    const Slow2: ComponentFn = () => {
      if (!r2) throw p2
      return h("span", null, "second")
    }

    function App() {
      return h(
        "div",
        null,
        h(Suspense, { fallback: h("span", null, "L1") }, h(Slow1, null)),
        h(Suspense, { fallback: h("span", null, "L2") }, h(Slow2, null)),
      )
    }

    const html = await collectStream(renderToReadableStream(h(App, null)))
    // Swap function definition should appear only once
    const swapDefCount = (html.match(/function \$ph/g) ?? []).length
    expect(swapDefCount).toBe(1)
    // But swap calls should appear for each boundary
    const swapCallCount = (html.match(/\$ph\(\d+\)/g) ?? []).length
    expect(swapCallCount).toBe(2)
  })

  it("uses unique IDs for multiple Suspense boundaries", async () => {
    let r1 = false
    let r2 = false
    const p1 = Promise.resolve().then(() => {
      r1 = true
    })
    const p2 = Promise.resolve().then(() => {
      r2 = true
    })

    const Slow1: ComponentFn = () => {
      if (!r1) throw p1
      return h("span", null, "a")
    }
    const Slow2: ComponentFn = () => {
      if (!r2) throw p2
      return h("span", null, "b")
    }

    function App() {
      return h(
        "div",
        null,
        h(Suspense, { fallback: h("span", null, "F1") }, h(Slow1, null)),
        h(Suspense, { fallback: h("span", null, "F2") }, h(Slow2, null)),
      )
    }

    const html = await collectStream(renderToReadableStream(h(App, null)))
    expect(html).toContain('id="ph:0"')
    expect(html).toContain('id="ph:1"')
    expect(html).toContain('id="phr:0"')
    expect(html).toContain('id="phr:1"')
  })

  it("resolved content is inside hidden div with correct ID", async () => {
    let resolved = false
    const promise = Promise.resolve().then(() => {
      resolved = true
    })
    const Slow: ComponentFn = () => {
      if (!resolved) throw promise
      return h("span", null, "resolved-content")
    }

    function App() {
      return h(Suspense, { fallback: h("span", null, "fallback") }, h(Slow, null))
    }

    const html = await collectStream(renderToReadableStream(h(App, null)))
    // The resolved content should be in a hidden div
    expect(html).toContain('<div hidden id="phr:0">')
    expect(html).toContain("resolved-content")
  })

  it("renders resolved content directly when component does not suspend", async () => {
    // Component that is already resolved -- no Suspense fallback path
    function Ready() {
      return h("span", null, "ready")
    }

    function App() {
      return h(Suspense, { fallback: h("span", null, "Loading...") }, h(Ready, null))
    }

    const html = await collectStream(renderToReadableStream(h(App, null)))
    expect(html).toBe("<span>ready</span>")
    expect(html).not.toContain("Loading")
    expect(html).not.toContain("$ph")
  })

  it("backward compatible: non-Suspense stream matches renderToString", async () => {
    function App() {
      const [count] = useState(5)
      return h("div", null, h("p", null, String(count)), h("ul", null, h("li", null, "item")))
    }

    const sync = renderToString(h(App, null))
    const streamed = await collectStream(renderToReadableStream(h(App, null)))
    expect(streamed).toBe(sync)
  })
})
