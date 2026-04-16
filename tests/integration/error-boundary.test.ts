import { describe, expect, it } from "vitest"
import { ErrorBoundary, flushUpdates, h, mount, patch, unmount } from "../../src/index"
import type { ComponentFn } from "../../src/vnode"
import type { VNode } from "../../src/vnode"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setup(): HTMLDivElement {
  return document.createElement("div")
}

function ThrowingComponent(props: Record<string, unknown>): VNode {
  if (props["shouldThrow"]) {
    throw new Error("test error")
  }
  return h("span", null, "ok")
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ErrorBoundary", () => {
  // 1. Renders children normally when no error occurs
  it("renders children normally when no error occurs", () => {
    const container = setup()

    function Child(): VNode {
      return h("span", null, "hello")
    }

    const vnode = h(ErrorBoundary, { fallback: () => h("div", null, "oops") }, h(Child, null))
    mount(vnode, container)

    expect(container.innerHTML).toBe("<span>hello</span>")
  })

  // 2. Catches error from child component and renders fallback
  it("catches error from child component and renders fallback", () => {
    const container = setup()

    const fallback = (_err: unknown, _reset: () => void): VNode =>
      h("div", null, "caught an error")

    const vnode = h(
      ErrorBoundary,
      { fallback },
      h(ThrowingComponent, { shouldThrow: true }),
    )
    mount(vnode, container)

    expect(container.innerHTML).toBe("<div>caught an error</div>")
  })

  // 3. Fallback receives the error object
  it("passes the caught error to the fallback", () => {
    const container = setup()
    let capturedError: unknown

    const fallback = (err: unknown, _reset: () => void): VNode => {
      capturedError = err
      return h("div", null, "error ui")
    }

    const vnode = h(
      ErrorBoundary,
      { fallback },
      h(ThrowingComponent, { shouldThrow: true }),
    )
    mount(vnode, container)

    expect(capturedError).toBeInstanceOf(Error)
    expect((capturedError as Error).message).toBe("test error")
  })

  // 4. Reset clears error state and re-renders children
  it("reset function clears the error and re-renders children", () => {
    const container = setup()

    // Mount successfully first (child does not throw on initial mount)
    let resetFn: (() => void) | null = null

    const fallback = (_err: unknown, reset: () => void): VNode => {
      resetFn = reset
      return h("div", null, "fallback")
    }

    const oldVNode = h(
      ErrorBoundary,
      { fallback },
      h(ThrowingComponent, { shouldThrow: false }),
    )
    mount(oldVNode, container)
    expect(container.innerHTML).toBe("<span>ok</span>")

    // Patch to a throwing child to trigger the fallback
    const errorVNode = h(
      ErrorBoundary,
      { fallback },
      h(ThrowingComponent, { shouldThrow: true }),
    )
    patch(oldVNode, errorVNode, container)
    expect(container.innerHTML).toBe("<div>fallback</div>")
    expect(resetFn).not.toBeNull()

    // Call reset to clear the error state (sets error hook to null, schedules re-render)
    resetFn!()

    // Patch with a working child — patchComponent runs immediately with fresh props,
    // clearing the queued flag and re-rendering cleanly with no error
    const recoveredVNode = h(
      ErrorBoundary,
      { fallback },
      h(ThrowingComponent, { shouldThrow: false }),
    )
    patch(errorVNode, recoveredVNode, container)
    // Drain any pending scheduled microtask re-renders
    flushUpdates()

    expect(container.innerHTML).toBe("<span>ok</span>")
  })

  // 5. Catches error during mount (initial render)
  it("catches error thrown during initial mount", () => {
    const container = setup()

    function AlwaysThrows(): VNode {
      throw new Error("mount error")
    }

    const fallback = (_err: unknown, _reset: () => void): VNode =>
      h("p", null, "mount failed")

    const vnode = h(ErrorBoundary, { fallback }, h(AlwaysThrows, null))
    mount(vnode, container)

    expect(container.innerHTML).toBe("<p>mount failed</p>")
  })

  // 6. Catches error during patch (props change causes throw)
  it("catches error thrown during patch when new props cause a throw", () => {
    const container = setup()

    const fallback = (_err: unknown, _reset: () => void): VNode =>
      h("div", null, "patch error caught")

    // Mount successfully first
    const oldVNode = h(
      ErrorBoundary,
      { fallback },
      h(ThrowingComponent, { shouldThrow: false }),
    )
    mount(oldVNode, container)
    expect(container.innerHTML).toBe("<span>ok</span>")

    // Patch with props that cause a throw
    const newVNode = h(
      ErrorBoundary,
      { fallback },
      h(ThrowingComponent, { shouldThrow: true }),
    )
    patch(oldVNode, newVNode, container)

    expect(container.innerHTML).toBe("<div>patch error caught</div>")
  })

  // 7. No fallback prop — renders empty text node on error
  it("renders nothing (empty text node) when no fallback prop is provided", () => {
    const container = setup()

    const vnode = h(ErrorBoundary, null, h(ThrowingComponent, { shouldThrow: true }))
    mount(vnode, container)

    // Empty text node — no visible HTML output
    expect(container.innerHTML).toBe("")
  })

  // 8. Catches error from a deeply nested component
  it("catches errors from deeply nested descendant components", () => {
    const container = setup()

    function DeepThrower(): VNode {
      throw new Error("deep error")
    }

    function Middle(): VNode {
      return h("section", null, h(DeepThrower, null))
    }

    function Outer(): VNode {
      return h("article", null, h(Middle, null))
    }

    const fallback = (_err: unknown, _reset: () => void): VNode =>
      h("span", null, "deep caught")

    const vnode = h(ErrorBoundary, { fallback }, h(Outer, null))
    mount(vnode, container)

    expect(container.innerHTML).toBe("<span>deep caught</span>")
  })

  // 9. Nested ErrorBoundaries — inner catches before outer
  it("inner ErrorBoundary catches the error before the outer one", () => {
    const container = setup()

    const outerFallback = (_err: unknown, _reset: () => void): VNode =>
      h("div", null, "outer caught")

    const innerFallback = (_err: unknown, _reset: () => void): VNode =>
      h("div", null, "inner caught")

    const vnode = h(
      ErrorBoundary,
      { fallback: outerFallback },
      h(
        ErrorBoundary,
        { fallback: innerFallback },
        h(ThrowingComponent, { shouldThrow: true }),
      ),
    )
    mount(vnode, container)

    // Inner boundary should have handled it — outer should not be visible
    expect(container.innerHTML).toBe("<div>inner caught</div>")
  })

  // 10. ErrorBoundary has _errorBoundary tag
  it("has the _errorBoundary tag on the component function", () => {
    expect((ErrorBoundary as unknown as Record<string, unknown>)["_errorBoundary"]).toBe(true)
  })

  // --- Additional edge cases ---

  // 11. Multiple children wrapped in a container — error in one child triggers fallback
  it("triggers fallback when one of multiple children (in a wrapper) throws", () => {
    const container = setup()

    function Fine(): VNode {
      return h("span", null, "fine")
    }

    // ErrorBoundary expects a single child VNode; wrap multiple in a container element
    function BothChildren(): VNode {
      return h("div", null, h(Fine, null), h(ThrowingComponent, { shouldThrow: true }))
    }

    const fallback = (_err: unknown, _reset: () => void): VNode =>
      h("div", null, "multi-child fallback")

    const vnode = h(ErrorBoundary, { fallback }, h(BothChildren, null))
    mount(vnode, container)

    expect(container.innerHTML).toBe("<div>multi-child fallback</div>")
  })

  // 12. Reset after patch error — recovering from a patch-time error
  it("reset recovers from a patch-time error", () => {
    const container = setup()

    let resetFn: (() => void) | null = null

    const fallback = (_err: unknown, reset: () => void): VNode => {
      resetFn = reset
      return h("div", null, "patch fallback")
    }

    // Initial successful mount
    const oldVNode = h(
      ErrorBoundary,
      { fallback },
      h(ThrowingComponent, { shouldThrow: false }),
    )
    mount(oldVNode, container)
    expect(container.innerHTML).toBe("<span>ok</span>")

    // Patch with throwing props to trigger the fallback
    const errorVNode = h(
      ErrorBoundary,
      { fallback },
      h(ThrowingComponent, { shouldThrow: true }),
    )
    patch(oldVNode, errorVNode, container)
    expect(container.innerHTML).toBe("<div>patch fallback</div>")
    expect(resetFn).not.toBeNull()

    // Reset clears the error hook, then patch with safe children to recover
    resetFn!()
    const safeVNode = h(
      ErrorBoundary,
      { fallback },
      h(ThrowingComponent, { shouldThrow: false }),
    )
    patch(errorVNode, safeVNode, container)
    // Drain any pending scheduled re-render from the reset
    flushUpdates()

    expect(container.innerHTML).toBe("<span>ok</span>")
  })

  // 13. Unmounting an ErrorBoundary in error state does not throw
  it("unmounts cleanly when in error state", () => {
    const container = setup()

    const fallback = (_err: unknown, _reset: () => void): VNode =>
      h("div", null, "error state")

    const vnode = h(ErrorBoundary, { fallback }, h(ThrowingComponent, { shouldThrow: true }))
    mount(vnode, container)
    expect(container.innerHTML).toBe("<div>error state</div>")

    expect(() => {
      unmount(vnode, container)
    }).not.toThrow()
  })

  // 14. ErrorBoundary renders nothing when no children and no error
  it("renders empty placeholder when no children are provided", () => {
    const container = setup()

    const fallback = (_err: unknown, _reset: () => void): VNode =>
      h("div", null, "error")

    const vnode = h(ErrorBoundary, { fallback })
    mount(vnode, container)

    expect(container.innerHTML).toBe("")
  })

  // 15. ErrorBoundary is itself a valid ComponentFn
  it("is a valid component function that can be used with h()", () => {
    const eb = ErrorBoundary as ComponentFn
    expect(typeof eb).toBe("function")
    expect(eb.length).toBeGreaterThanOrEqual(0)
  })
})
