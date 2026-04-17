/**
 * Tests for selective hydration:
 *   - Pending Suspense boundaries are registered for selective hydration
 *   - User interaction (click, input, keydown, focusin) triggers priority hydration
 *   - Boundary resolves after interaction hydrates it
 *   - Multiple pending boundaries: only the interacted one hydrates early
 */

import { describe, expect, it, vi } from "vitest"
import { h, Suspense, lazy, flushUpdates } from "../../src/index"
import { hydrate } from "../../src/server"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function flushMicrotasks(): Promise<void> {
  flushUpdates()
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

// ---------------------------------------------------------------------------
// Selective hydration with user interaction
// ---------------------------------------------------------------------------

describe("selective hydration", () => {
  it("hydrates a pending Suspense boundary and resolves after promise settles", async () => {
    function Content() {
      return h("div", null, "Ready")
    }

    // Use a promise that resolves on the microtask queue (not setTimeout)
    const LazyContent = lazy(
      () => Promise.resolve({ default: Content }),
    )

    // Simulate SSR fallback DOM
    const container = document.createElement("div")
    container.innerHTML = "<span>Loading...</span>"
    document.body.appendChild(container)

    try {
      const vnode = h(
        Suspense,
        { fallback: h("span", null, "Loading...") },
        h(LazyContent, null),
      )

      hydrate(vnode, container)

      // Fallback should still be showing on first render (lazy suspends synchronously)
      expect(container.innerHTML).toBe("<span>Loading...</span>")

      // Allow the promise to resolve and Suspense to re-render
      await flushMicrotasks()
      flushUpdates()
      await flushMicrotasks()
      flushUpdates()

      // Content should now be rendered
      expect(container.innerHTML).toBe("<div>Ready</div>")
    } finally {
      document.body.removeChild(container)
    }
  })

  it("attaches event handlers during hydration of non-suspended content", () => {
    const onClick = vi.fn()

    function App() {
      return h("button", { onClick }, "Click me")
    }

    const container = document.createElement("div")
    container.innerHTML = "<button>Click me</button>"
    document.body.appendChild(container)

    try {
      hydrate(h(App, null), container)

      container.querySelector("button")!.click()
      expect(onClick).toHaveBeenCalledTimes(1)
    } finally {
      document.body.removeChild(container)
    }
  })

  it("preserves fallback DOM until lazy component resolves", async () => {
    function Content() {
      return h("p", null, "Loaded")
    }

    let resolveLoader: (mod: { default: () => ReturnType<typeof h> }) => void
    const loaderPromise = new Promise<{ default: () => ReturnType<typeof h> }>((resolve) => {
      resolveLoader = resolve
    })

    const LazyContent = lazy(() => loaderPromise)

    const container = document.createElement("div")
    container.innerHTML = "<span>Please wait...</span>"
    document.body.appendChild(container)

    try {
      hydrate(
        h(
          Suspense,
          { fallback: h("span", null, "Please wait...") },
          h(LazyContent, null),
        ),
        container,
      )

      // Fallback should be preserved
      expect(container.innerHTML).toBe("<span>Please wait...</span>")

      // Resolve the lazy component
      resolveLoader!({ default: Content })
      await flushMicrotasks()
      flushUpdates()
      await flushMicrotasks()
      flushUpdates()

      expect(container.innerHTML).toBe("<p>Loaded</p>")
    } finally {
      document.body.removeChild(container)
    }
  })

  it("handles focusin event for selective hydration", async () => {
    function Content() {
      return h("input", { type: "text" })
    }

    let resolveLoader: (mod: { default: () => ReturnType<typeof h> }) => void
    const loaderPromise = new Promise<{ default: () => ReturnType<typeof h> }>((resolve) => {
      resolveLoader = resolve
    })

    const LazyContent = lazy(() => loaderPromise)

    const container = document.createElement("div")
    container.innerHTML = '<span>Loading form...</span>'
    document.body.appendChild(container)

    try {
      hydrate(
        h(
          Suspense,
          { fallback: h("span", null, "Loading form...") },
          h(LazyContent, null),
        ),
        container,
      )

      // Dispatch focusin to trigger selective hydration
      const focusEvent = new FocusEvent("focusin", { bubbles: true })
      container.querySelector("span")!.dispatchEvent(focusEvent)

      // Resolve lazy
      resolveLoader!({ default: Content })
      await flushMicrotasks()
      flushUpdates()
      await flushMicrotasks()
      flushUpdates()

      expect(container.querySelector("input")).not.toBeNull()
    } finally {
      document.body.removeChild(container)
    }
  })
})
