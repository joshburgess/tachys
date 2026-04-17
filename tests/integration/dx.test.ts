import { afterEach, describe, expect, it, vi } from "vitest"
import {
  __DEV__,
  flushUpdates,
  getComponentName,
  h,
  mount,
  patch,
  unmount,
  useEffect,
  useState,
  useSyncExternalStore,
} from "../../src/index"
import { resetWarnings } from "../../src/dev"
import type { VNode } from "../../src/vnode"

function flushMicrotasks(): Promise<void> {
  flushUpdates()
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

afterEach(() => {
  resetWarnings()
})

// ---------------------------------------------------------------------------
// __DEV__ flag
// ---------------------------------------------------------------------------

describe("__DEV__ flag", () => {
  it("is true in test environment", () => {
    expect(__DEV__).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// getComponentName
// ---------------------------------------------------------------------------

describe("getComponentName", () => {
  it("returns function name", () => {
    function MyComponent() {
      return h("div", null)
    }
    expect(getComponentName(MyComponent)).toBe("MyComponent")
  })

  it("returns displayName when set", () => {
    const Comp = () => h("div", null)
    ;(Comp as unknown as { displayName: string }).displayName = "CustomName"
    expect(getComponentName(Comp)).toBe("CustomName")
  })

  it("prefers displayName over function name", () => {
    function OriginalName() {
      return h("div", null)
    }
    ;(OriginalName as unknown as { displayName: string }).displayName = "OverriddenName"
    expect(getComponentName(OriginalName)).toBe("OverriddenName")
  })

  it("returns Anonymous for arrow functions without name", () => {
    // Object property assignment strips the inferred name in some engines,
    // so use a cast through a nameless reference.
    const obj: Record<string, unknown> = {}
    obj["fn"] = (() => {
      const f = Function("return function(){}")()
      return f
    })()
    expect(getComponentName(obj["fn"] as () => void)).toBe("Anonymous")
  })

  it("returns Anonymous for null/undefined", () => {
    expect(getComponentName(null)).toBe("Anonymous")
    expect(getComponentName(undefined)).toBe("Anonymous")
  })

  it("returns tag name for strings", () => {
    expect(getComponentName("div" as unknown as () => void)).toBe("div")
  })

  it("follows _inner for memo-wrapped components", () => {
    function Inner() {
      return h("div", null)
    }
    const memoized = (() => h("div", null)) as unknown as {
      _inner: () => VNode
      name: string
    }
    memoized._inner = Inner
    // The wrapper has no useful name, but _inner does
    expect(getComponentName(memoized as unknown as () => void)).toBe("Inner")
  })
})

// ---------------------------------------------------------------------------
// Duplicate key warnings
// ---------------------------------------------------------------------------

describe("duplicate key warnings", () => {
  it("warns when h() receives children with duplicate keys", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    h(
      "ul",
      null,
      h("li", { key: "a" }, "A"),
      h("li", { key: "b" }, "B"),
      h("li", { key: "a" }, "A2"), // duplicate
    )

    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0]![0]).toContain("Duplicate key")
    expect(warnSpy.mock.calls[0]![0]).toContain('"a"')

    warnSpy.mockRestore()
  })

  it("does not warn when keys are unique", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    h(
      "ul",
      null,
      h("li", { key: "a" }, "A"),
      h("li", { key: "b" }, "B"),
      h("li", { key: "c" }, "C"),
    )

    expect(warnSpy).not.toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  it("does not warn for non-keyed children", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    h("ul", null, h("li", null, "A"), h("li", null, "B"))

    expect(warnSpy).not.toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  it("warns only once per duplicate (not per duplicate pair)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    h(
      "ul",
      null,
      h("li", { key: "x" }, "1"),
      h("li", { key: "x" }, "2"),
      h("li", { key: "x" }, "3"),
    )

    // Should emit exactly one warning
    expect(warnSpy).toHaveBeenCalledTimes(1)

    warnSpy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// Hook order validation
// ---------------------------------------------------------------------------

describe("hook order validation", () => {
  it("warns when hook count changes between renders", async () => {
    const container = document.createElement("div")
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    let condition = true
    let triggerRender: (() => void) | null = null

    function BadComponent() {
      const [, setCount] = useState(0)
      triggerRender = () => setCount((c) => c + 1)

      if (condition) {
        useState("only-on-first-render")
      }
      return h("div", null, "test")
    }

    const vnode = h(BadComponent, null)
    mount(vnode, container)

    // First render: 2 useState calls
    expect(warnSpy).not.toHaveBeenCalled()

    // Second render: 1 useState call (different count)
    condition = false
    triggerRender!()
    await flushMicrotasks()
    flushUpdates()

    expect(warnSpy).toHaveBeenCalled()
    const msg = warnSpy.mock.calls[0]![0] as string
    expect(msg).toContain("different number of hooks")
    expect(msg).toContain("BadComponent")

    warnSpy.mockRestore()
  })

  it("does not warn when hook count is stable", async () => {
    const container = document.createElement("div")
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    let triggerRender: (() => void) | null = null

    function GoodComponent() {
      const [count, setCount] = useState(0)
      triggerRender = () => setCount((c) => c + 1)
      useState("always-called")
      return h("div", null, String(count))
    }

    const vnode = h(GoodComponent, null)
    mount(vnode, container)

    triggerRender!()
    await flushMicrotasks()
    flushUpdates()

    expect(warnSpy).not.toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  it("includes displayName in warning when set", async () => {
    const container = document.createElement("div")
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    let condition = true
    let triggerRender: (() => void) | null = null

    const Comp = function () {
      const [, setCount] = useState(0)
      triggerRender = () => setCount((c) => c + 1)
      if (condition) useState("extra")
      return h("div", null)
    }
    ;(Comp as unknown as { displayName: string }).displayName = "MyWidget"

    mount(h(Comp, null), container)
    condition = false
    triggerRender!()
    await flushMicrotasks()
    flushUpdates()

    expect(warnSpy).toHaveBeenCalled()
    expect((warnSpy.mock.calls[0]![0] as string)).toContain("MyWidget")

    warnSpy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// Improved hook error messages
// ---------------------------------------------------------------------------

describe("hook error messages", () => {
  it("useState throws with helpful message outside component", () => {
    expect(() => useState(0)).toThrow("useState must be called inside a component render")
    expect(() => useState(0)).toThrow("not calling hooks outside of a component function")
  })
})

// ---------------------------------------------------------------------------
// useSyncExternalStore
// ---------------------------------------------------------------------------

describe("useSyncExternalStore", () => {
  it("returns the initial snapshot on mount", () => {
    const container = document.createElement("div")

    const store = createMockStore(42)

    function Comp() {
      const value = useSyncExternalStore(store.subscribe, store.getSnapshot)
      return h("span", null, String(value))
    }

    mount(h(Comp, null), container)
    expect(container.innerHTML).toBe("<span>42</span>")
  })

  it("re-renders when the store emits a change", async () => {
    const container = document.createElement("div")

    const store = createMockStore(1)

    function Comp() {
      const value = useSyncExternalStore(store.subscribe, store.getSnapshot)
      return h("span", null, String(value))
    }

    mount(h(Comp, null), container)
    expect(container.innerHTML).toBe("<span>1</span>")

    store.set(2)
    await flushMicrotasks()
    flushUpdates()

    expect(container.innerHTML).toBe("<span>2</span>")
  })

  it("unsubscribes on unmount", () => {
    const container = document.createElement("div")

    const store = createMockStore(0)

    function Comp() {
      const value = useSyncExternalStore(store.subscribe, store.getSnapshot)
      return h("span", null, String(value))
    }

    const vnode = h(Comp, null)
    mount(vnode, container)
    expect(store.listenerCount()).toBe(1)

    unmount(vnode, container)
    expect(store.listenerCount()).toBe(0)
  })

  it("handles multiple rapid updates", async () => {
    const container = document.createElement("div")

    const store = createMockStore(0)

    function Comp() {
      const value = useSyncExternalStore(store.subscribe, store.getSnapshot)
      return h("span", null, String(value))
    }

    mount(h(Comp, null), container)

    store.set(1)
    store.set(2)
    store.set(3)
    await flushMicrotasks()
    flushUpdates()

    expect(container.innerHTML).toBe("<span>3</span>")
  })

  it("re-subscribes when subscribe function changes", async () => {
    const container = document.createElement("div")

    const store1 = createMockStore(10)
    const store2 = createMockStore(20)

    let useFirst = true
    let triggerRender: (() => void) | null = null

    function Comp() {
      const [, setTick] = useState(0)
      triggerRender = () => setTick((t) => t + 1)

      const store = useFirst ? store1 : store2
      const value = useSyncExternalStore(store.subscribe, store.getSnapshot)
      return h("span", null, String(value))
    }

    mount(h(Comp, null), container)
    expect(container.innerHTML).toBe("<span>10</span>")

    // Switch to store2
    useFirst = false
    triggerRender!()
    await flushMicrotasks()
    flushUpdates()
    // After re-subscribe, should read store2's value
    await flushMicrotasks()
    flushUpdates()

    expect(container.innerHTML).toBe("<span>20</span>")
  })

  it("works with object snapshots (reference equality)", async () => {
    const container = document.createElement("div")

    const obj1 = { count: 1 }
    const obj2 = { count: 2 }
    let current = obj1
    const listeners = new Set<() => void>()

    const subscribe = (cb: () => void) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    }
    const getSnapshot = () => current

    function Comp() {
      const value = useSyncExternalStore(subscribe, getSnapshot)
      return h("span", null, String(value.count))
    }

    mount(h(Comp, null), container)
    expect(container.innerHTML).toBe("<span>1</span>")

    current = obj2
    for (const fn of listeners) fn()
    await flushMicrotasks()
    flushUpdates()

    expect(container.innerHTML).toBe("<span>2</span>")
  })

  it("does not re-render when snapshot is referentially equal", async () => {
    const container = document.createElement("div")

    let renderCount = 0
    const store = createMockStore(5)

    function Comp() {
      renderCount++
      const value = useSyncExternalStore(store.subscribe, store.getSnapshot)
      return h("span", null, String(value))
    }

    mount(h(Comp, null), container)
    expect(renderCount).toBe(1)

    // Emit change but value is the same
    store.set(5)
    await flushMicrotasks()
    flushUpdates()

    // Should not have triggered an extra render (value didn't change)
    expect(renderCount).toBe(1)
  })

  it("throws when called outside a component", () => {
    expect(() =>
      useSyncExternalStore(
        () => () => {},
        () => 0,
      ),
    ).toThrow("useSyncExternalStore must be called inside a component render")
  })

  it("detects snapshot changes during render (tearing prevention)", () => {
    const container = document.createElement("div")
    const store = createMockStore(1)

    const snapshots: number[] = []

    function Comp() {
      const value = useSyncExternalStore(store.subscribe, store.getSnapshot)
      snapshots.push(value)
      return h("span", null, String(value))
    }

    mount(h(Comp, null), container)
    expect(container.innerHTML).toBe("<span>1</span>")
    expect(snapshots).toEqual([1])

    // Change the store and trigger a re-render
    store.set(2)
    flushUpdates()

    // The component should see the fresh snapshot value
    expect(container.innerHTML).toBe("<span>2</span>")
  })

  it("accepts getServerSnapshot parameter for API compatibility", () => {
    const container = document.createElement("div")

    function Comp() {
      const value = useSyncExternalStore(
        (cb: () => void) => { cb; return () => {} },
        () => "client",
        () => "server",
      )
      return h("span", null, value)
    }

    mount(h(Comp, null), container)
    // Client-side: uses getSnapshot, not getServerSnapshot
    expect(container.innerHTML).toBe("<span>client</span>")
  })
})

// ---------------------------------------------------------------------------
// Helper: mock external store
// ---------------------------------------------------------------------------

function createMockStore<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()

  return {
    getSnapshot: () => value,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    set: (next: T) => {
      value = next
      for (const fn of listeners) fn()
    },
    listenerCount: () => listeners.size,
  }
}
