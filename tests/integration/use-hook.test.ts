import { describe, expect, it } from "vitest"
import {
  ErrorBoundary,
  Suspense,
  createContext,
  flushUpdates,
  h,
  mount,
  use,
  useState,
} from "../../src/index"
import type { VNode } from "../../src/vnode"

function flushMicrotasks(): Promise<void> {
  flushUpdates()
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

// ---------------------------------------------------------------------------
// use() with Context
// ---------------------------------------------------------------------------

describe("use() with Context", () => {
  it("reads the default context value", () => {
    const Ctx = createContext("default")

    function Comp() {
      const value = use(Ctx)
      return h("span", null, value)
    }

    const container = document.createElement("div")
    mount(h(Comp, null), container)
    expect(container.innerHTML).toBe("<span>default</span>")
  })

  it("reads the provided context value", () => {
    const Ctx = createContext("default")

    function Comp() {
      const value = use(Ctx)
      return h("span", null, value)
    }

    const container = document.createElement("div")
    mount(h(Ctx.Provider, { value: "provided" }, h(Comp, null)), container)
    expect(container.innerHTML).toBe("<span>provided</span>")
  })

  it("can be called conditionally", () => {
    const Ctx = createContext("fallback")

    function Comp(props: Record<string, unknown>) {
      const useCtx = props["useCtx"] as boolean
      const [count] = useState(0)

      let value: string
      if (useCtx) {
        value = use(Ctx)
      } else {
        value = "direct"
      }

      return h("span", null, `${value}-${count}`)
    }

    const container = document.createElement("div")
    mount(h(Comp, { useCtx: false }), container)
    expect(container.innerHTML).toBe("<span>direct-0</span>")
  })

  it("reads provided value when called conditionally", () => {
    const Ctx = createContext("fallback")

    function Comp(props: Record<string, unknown>) {
      const useCtx = props["useCtx"] as boolean
      let value: string
      if (useCtx) {
        value = use(Ctx)
      } else {
        value = "direct"
      }
      return h("span", null, value)
    }

    const container = document.createElement("div")
    mount(
      h(Ctx.Provider, { value: "from-provider" }, h(Comp, { useCtx: true })),
      container,
    )
    expect(container.innerHTML).toBe("<span>from-provider</span>")
  })
})

// ---------------------------------------------------------------------------
// use() with Promise
// ---------------------------------------------------------------------------

describe("use() with Promise", () => {
  it("resolves a Promise and renders the value", async () => {
    const resolved = Promise.resolve("data")

    function Comp() {
      const value = use(resolved)
      return h("span", null, value)
    }

    const container = document.createElement("div")
    mount(
      h(Suspense, { fallback: h("div", null, "Loading") }, h(Comp, null)),
      container,
    )

    // First render suspends (Promise.then callback is a microtask)
    expect(container.innerHTML).toBe("<div>Loading</div>")

    // After microtasks flush, the promise is resolved and Suspense re-renders
    await flushMicrotasks()
    flushUpdates()
    await flushMicrotasks()
    flushUpdates()

    expect(container.innerHTML).toBe("<span>data</span>")
  })

  it("suspends on a pending Promise and resolves after", async () => {
    let resolvePromise: (val: string) => void
    const promise = new Promise<string>((resolve) => {
      resolvePromise = resolve
    })

    function Comp() {
      const value = use(promise)
      return h("span", null, value)
    }

    const container = document.createElement("div")
    mount(
      h(Suspense, { fallback: h("div", null, "Loading...") }, h(Comp, null)),
      container,
    )

    // Should show fallback while pending
    expect(container.innerHTML).toBe("<div>Loading...</div>")

    // Resolve the promise
    resolvePromise!("resolved data")
    await flushMicrotasks()
    flushUpdates()
    await flushMicrotasks()
    flushUpdates()

    expect(container.innerHTML).toBe("<span>resolved data</span>")
  })

  it("suspends on a pending Promise that later rejects", async () => {
    let doReject: (err: Error) => void
    const promise = new Promise<string>((_, reject) => {
      doReject = (err) => reject(err)
    })
    // Prevent unhandled rejection in the test
    promise.catch(() => {})

    function Comp() {
      const value = use(promise)
      return h("span", null, String(value))
    }

    const container = document.createElement("div")
    mount(
      h(Suspense, { fallback: h("div", null, "Loading") }, h(Comp, null)),
      container,
    )

    // Suspense shows fallback while pending
    expect(container.innerHTML).toBe("<div>Loading</div>")

    // Reject the promise -- Suspense clears loading state and re-renders.
    // use() throws the rejection error, which renderComponent catches and
    // returns an empty placeholder (no ErrorBoundary to catch it).
    doReject!(new Error("fail"))
    await flushMicrotasks()
    flushUpdates()

    expect(container.textContent).toBe("")
  })

  it("rejection is caught by ErrorBoundary inside Suspense", async () => {
    let doReject: (err: Error) => void
    const promise = new Promise<string>((_, reject) => {
      doReject = (err) => reject(err)
    })
    promise.catch(() => {})

    function Comp() {
      const value = use(promise)
      return h("span", null, String(value))
    }

    const errorFallback = (err: unknown): VNode =>
      h("div", null, `error: ${(err as Error).message}`)

    const container = document.createElement("div")
    mount(
      h(
        Suspense,
        { fallback: h("div", null, "Loading") },
        h(ErrorBoundary, { fallback: errorFallback }, h(Comp, null)),
      ),
      container,
    )

    expect(container.innerHTML).toBe("<div>Loading</div>")

    doReject!(new Error("network failure"))
    await flushMicrotasks()
    flushUpdates()
    await flushMicrotasks()
    flushUpdates()

    // ErrorBoundary inside Suspense catches the rejection error
    expect(container.innerHTML).toBe("<div>error: network failure</div>")
  })

  it("caches Promise results across re-reads", async () => {
    const promise = Promise.resolve(42)

    let renderCount = 0

    function Comp() {
      renderCount++
      const value = use(promise)
      return h("span", null, String(value))
    }

    const container = document.createElement("div")
    mount(
      h(Suspense, { fallback: h("div", null, "...") }, h(Comp, null)),
      container,
    )

    // First render suspends
    expect(container.innerHTML).toBe("<div>...</div>")

    // After resolution, Suspense re-renders and the value is cached
    await flushMicrotasks()
    flushUpdates()
    await flushMicrotasks()
    flushUpdates()

    expect(container.innerHTML).toBe("<span>42</span>")
    // Comp rendered twice: once during suspend (threw), once after resolve
    expect(renderCount).toBe(2)
  })
})
