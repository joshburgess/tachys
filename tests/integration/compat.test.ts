import { describe, expect, it } from "vitest"
import {
  Children,
  Component,
  Fragment,
  Profiler,
  PureComponent,
  StrictMode,
  act,
  cloneElement,
  createRoot,
  createElement,
  flushSync,
  hydrateRoot,
  isValidElement,
  useActionState,
  useFormStatus,
  useOptimistic,
  version,
} from "../../src/compat"
import { flushUpdates, h, mount, useState } from "../../src/index"
import type { VNode } from "../../src/vnode"

// ---------------------------------------------------------------------------
// isValidElement
// ---------------------------------------------------------------------------

describe("isValidElement", () => {
  it("returns true for VNodes created by h()", () => {
    expect(isValidElement(h("div", null))).toBe(true)
    expect(isValidElement(h("span", null, "text"))).toBe(true)
  })

  it("returns true for component VNodes", () => {
    function Comp() {
      return h("div", null)
    }
    expect(isValidElement(h(Comp, null))).toBe(true)
  })

  it("returns false for primitives", () => {
    expect(isValidElement(null)).toBe(false)
    expect(isValidElement(undefined)).toBe(false)
    expect(isValidElement("string")).toBe(false)
    expect(isValidElement(42)).toBe(false)
    expect(isValidElement(true)).toBe(false)
  })

  it("returns false for plain objects", () => {
    expect(isValidElement({})).toBe(false)
    expect(isValidElement({ type: "div" })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// createElement (alias for h)
// ---------------------------------------------------------------------------

describe("createElement", () => {
  it("creates element VNodes just like h()", () => {
    const container = document.createElement("div")
    const vnode = createElement("span", { className: "test" }, "hello")
    mount(vnode, container)
    expect(container.innerHTML).toBe('<span class="test">hello</span>')
  })

  it("creates fragment VNodes with null type", () => {
    const vnode = createElement(null, null, createElement("a", null), createElement("b", null))
    expect(vnode.type).toBe(null)
  })
})

// ---------------------------------------------------------------------------
// Fragment
// ---------------------------------------------------------------------------

describe("Fragment", () => {
  it("is null (Phasm fragment sentinel)", () => {
    expect(Fragment).toBe(null)
  })
})

// ---------------------------------------------------------------------------
// cloneElement
// ---------------------------------------------------------------------------

describe("cloneElement", () => {
  it("clones a VNode with the same props", () => {
    const original = h("div", { id: "test" }, "child")
    const cloned = cloneElement(original)

    expect(cloned).not.toBe(original)
    expect(cloned.type).toBe("div")
    expect(cloned.props!["id"]).toBe("test")
    expect(cloned.children).toBe("child")
  })

  it("merges new props onto the original", () => {
    const original = h("div", { id: "a", title: "old" })
    const cloned = cloneElement(original, { title: "new", "data-x": "1" })

    expect(cloned.props!["id"]).toBe("a")
    expect(cloned.props!["title"]).toBe("new")
    expect(cloned.props!["data-x"]).toBe("1")
  })

  it("overrides key from new props", () => {
    const original = h("li", { key: "old" }, "item")
    const cloned = cloneElement(original, { key: "new" })
    expect(cloned.key).toBe("new")
  })

  it("preserves original key when not overridden", () => {
    const original = h("li", { key: "keep" }, "item")
    const cloned = cloneElement(original, { title: "x" })
    expect(cloned.key).toBe("keep")
  })

  it("overrides className from new props", () => {
    const original = h("div", { className: "old" })
    const cloned = cloneElement(original, { className: "new" })
    expect(cloned.className).toBe("new")
  })

  it("replaces children when new children are provided", () => {
    const container = document.createElement("div")
    const original = h("div", null, "old child")
    const cloned = cloneElement(original, null, "new child")
    mount(cloned, container)
    expect(container.innerHTML).toBe("<div>new child</div>")
  })

  it("preserves original children when no new children provided", () => {
    const original = h("div", null, "keep me")
    const cloned = cloneElement(original, { id: "x" })
    expect(cloned.children).toBe("keep me")
  })

  it("renders correctly after clone", () => {
    const container = document.createElement("div")
    const original = h("span", { className: "cls" }, "text")
    const cloned = cloneElement(original, { id: "cloned" })
    mount(cloned, container)
    const span = container.querySelector("span")!
    expect(span.getAttribute("id")).toBe("cloned")
    expect(span.className).toBe("cls")
    expect(span.textContent).toBe("text")
  })
})

// ---------------------------------------------------------------------------
// Children
// ---------------------------------------------------------------------------

describe("Children", () => {
  describe("map", () => {
    it("maps over an array of VNodes", () => {
      const kids = [h("a", null), h("b", null), h("c", null)]
      const types = Children.map(kids, (child) => child.type)
      expect(types).toEqual(["a", "b", "c"])
    })

    it("maps over a single VNode", () => {
      const kid = h("span", null)
      const types = Children.map(kid, (child) => child.type)
      expect(types).toEqual(["span"])
    })

    it("returns empty array for null", () => {
      expect(Children.map(null, () => null)).toEqual([])
    })

    it("converts string children to text VNodes", () => {
      const results = Children.map("hello", (child) => child.children)
      expect(results).toEqual(["hello"])
    })

    it("passes index to callback", () => {
      const kids = [h("a", null), h("b", null)]
      const indices = Children.map(kids, (_, i) => i)
      expect(indices).toEqual([0, 1])
    })
  })

  describe("forEach", () => {
    it("iterates over array children", () => {
      const kids = [h("a", null), h("b", null)]
      const types: unknown[] = []
      Children.forEach(kids, (child) => types.push(child.type))
      expect(types).toEqual(["a", "b"])
    })

    it("iterates over single child", () => {
      const kid = h("div", null)
      const types: unknown[] = []
      Children.forEach(kid, (child) => types.push(child.type))
      expect(types).toEqual(["div"])
    })

    it("does nothing for null", () => {
      const spy: unknown[] = []
      Children.forEach(null, () => spy.push(1))
      expect(spy).toEqual([])
    })
  })

  describe("count", () => {
    it("counts array children", () => {
      expect(Children.count([h("a", null), h("b", null), h("c", null)])).toBe(3)
    })

    it("counts single child as 1", () => {
      expect(Children.count(h("div", null))).toBe(1)
    })

    it("counts string as 1", () => {
      expect(Children.count("text")).toBe(1)
    })

    it("counts null as 0", () => {
      expect(Children.count(null)).toBe(0)
    })
  })

  describe("only", () => {
    it("returns the only child", () => {
      const kid = h("span", null)
      expect(Children.only(kid)).toBe(kid)
    })

    it("returns the only array child", () => {
      const kid = h("span", null)
      expect(Children.only([kid])).toBe(kid)
    })

    it("throws for no children", () => {
      expect(() => Children.only(null)).toThrow("expected a single child")
    })

    it("throws for multiple children", () => {
      expect(() => Children.only([h("a", null), h("b", null)])).toThrow(
        "expected a single child",
      )
    })
  })

  describe("toArray", () => {
    it("flattens single child to array", () => {
      const kid = h("div", null)
      const arr = Children.toArray(kid)
      expect(arr).toHaveLength(1)
      expect(arr[0]).toBe(kid)
    })

    it("returns copy of array children", () => {
      const kids = [h("a", null), h("b", null)]
      const arr = Children.toArray(kids)
      expect(arr).toEqual(kids)
      expect(arr).not.toBe(kids) // must be a copy
    })

    it("returns empty array for null", () => {
      expect(Children.toArray(null)).toEqual([])
    })
  })
})

// ---------------------------------------------------------------------------
// Component / PureComponent stubs
// ---------------------------------------------------------------------------

describe("Component stubs", () => {
  it("Component constructor throws", () => {
    expect(() => new Component()).toThrow("does not support class components")
  })

  it("PureComponent constructor throws", () => {
    expect(() => new PureComponent()).toThrow("does not support class components")
  })

  it("PureComponent is a subclass of Component", () => {
    expect(PureComponent.prototype instanceof Component).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// flushSync
// ---------------------------------------------------------------------------

describe("flushSync", () => {
  it("is exported and callable", () => {
    expect(typeof flushSync).toBe("function")
    // Should not throw when called with no pending updates
    flushSync()
  })
})

// ---------------------------------------------------------------------------
// version
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// StrictMode
// ---------------------------------------------------------------------------

describe("StrictMode", () => {
  it("is a passthrough component", () => {
    const container = document.createElement("div")
    mount(h(StrictMode, null, h("div", null, "inside strict")), container)
    expect(container.innerHTML).toBe("<div>inside strict</div>")
  })

  it("can wrap multiple children via fragment", () => {
    const container = document.createElement("div")
    mount(
      h(StrictMode, null, h(null, null, h("span", null, "a"), h("span", null, "b"))),
      container,
    )
    expect(container.innerHTML).toBe("<span>a</span><span>b</span>")
  })
})

// ---------------------------------------------------------------------------
// Profiler
// ---------------------------------------------------------------------------

describe("Profiler", () => {
  it("is a passthrough component", () => {
    const container = document.createElement("div")
    mount(h(Profiler, { id: "test", onRender: () => {} }, h("div", null, "profiled")), container)
    expect(container.innerHTML).toBe("<div>profiled</div>")
  })
})

// ---------------------------------------------------------------------------
// act
// ---------------------------------------------------------------------------

describe("act", () => {
  it("flushes synchronous updates", async () => {
    const container = document.createElement("div")
    let setCount: (n: number) => void

    function Counter() {
      const [count, sc] = useState(0)
      setCount = sc
      return h("span", null, String(count))
    }

    mount(h(Counter, null), container)
    expect(container.innerHTML).toBe("<span>0</span>")

    await act(() => {
      setCount(1)
    })
    expect(container.innerHTML).toBe("<span>1</span>")
  })

  it("handles async callbacks", async () => {
    const container = document.createElement("div")
    let setCount: (n: number) => void

    function Counter() {
      const [count, sc] = useState(0)
      setCount = sc
      return h("span", null, String(count))
    }

    mount(h(Counter, null), container)

    await act(async () => {
      await Promise.resolve()
      setCount(42)
    })
    expect(container.innerHTML).toBe("<span>42</span>")
  })
})

// ---------------------------------------------------------------------------
// createRoot / hydrateRoot (compat exports)
// ---------------------------------------------------------------------------

describe("createRoot compat export", () => {
  it("renders and unmounts", () => {
    const container = document.createElement("div")
    const root = createRoot(container)
    root.render(h("div", null, "root api"))
    expect(container.innerHTML).toBe("<div>root api</div>")
    root.unmount()
    expect(container.innerHTML).toBe("")
  })
})

// ---------------------------------------------------------------------------
// useOptimistic
// ---------------------------------------------------------------------------

describe("useOptimistic", () => {
  it("returns passthrough value by default", () => {
    const container = document.createElement("div")

    function Comp() {
      const [optimistic] = useOptimistic("confirmed")
      return h("span", null, optimistic)
    }

    mount(h(Comp, null), container)
    expect(container.innerHTML).toBe("<span>confirmed</span>")
  })

  it("applies optimistic update with updateFn", () => {
    const container = document.createElement("div")
    let addOptimistic!: (action: string) => void

    function Comp() {
      const [optimistic, add] = useOptimistic(
        "initial",
        (_current: string, action: string) => action,
      )
      addOptimistic = add
      return h("span", null, optimistic)
    }

    mount(h(Comp, null), container)
    expect(container.innerHTML).toBe("<span>initial</span>")

    addOptimistic("optimistic-value")
    flushUpdates()
    expect(container.innerHTML).toBe("<span>optimistic-value</span>")
  })
})

// ---------------------------------------------------------------------------
// useActionState
// ---------------------------------------------------------------------------

describe("useActionState", () => {
  it("returns initial state and isPending=false", () => {
    const container = document.createElement("div")

    function Comp() {
      const [state, , isPending] = useActionState(
        (prev: number, n: number) => prev + n,
        0,
      )
      return h("span", null, `${state}:${isPending}`)
    }

    mount(h(Comp, null), container)
    expect(container.innerHTML).toBe("<span>0:false</span>")
  })

  it("dispatches synchronous action", () => {
    const container = document.createElement("div")
    let dispatch!: (payload: number) => void

    function Comp() {
      const [state, d, isPending] = useActionState(
        (prev: number, n: number) => prev + n,
        0,
      )
      dispatch = d
      return h("span", null, `${state}:${isPending}`)
    }

    mount(h(Comp, null), container)
    dispatch(5)
    flushUpdates()
    expect(container.innerHTML).toBe("<span>5:false</span>")
  })

  it("isPending=true is visible before async action resolves", async () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    let dispatch!: (payload: number) => void
    let resolveAction!: (val: number) => void
    const snapshots: string[] = []

    function Comp() {
      const [state, d, isPending] = useActionState(
        (_prev: number, n: number) => {
          return new Promise<number>((r) => {
            resolveAction = (v: number) => r(v)
          })
        },
        0,
      )
      dispatch = d
      const text = `${state}:${isPending}`
      snapshots.push(text)
      return h("span", null, text)
    }

    mount(h(Comp, null), container)
    expect(container.innerHTML).toBe("<span>0:false</span>")

    dispatch(5)
    flushUpdates()

    // isPending should be true immediately
    expect(container.innerHTML).toBe("<span>0:true</span>")

    // Resolve the action
    resolveAction(42)
    // Wait for the promise + Transition flush
    await new Promise((r) => setTimeout(r, 20))
    flushUpdates()
    await new Promise((r) => setTimeout(r, 100))
    flushUpdates()

    expect(container.innerHTML).toBe("<span>42:false</span>")
    document.body.removeChild(container)
  })
})

// ---------------------------------------------------------------------------
// useFormStatus
// ---------------------------------------------------------------------------

describe("useFormStatus", () => {
  it("returns not-pending status", () => {
    const container = document.createElement("div")

    function Comp() {
      const status = useFormStatus()
      return h("span", null, `pending:${status.pending}`)
    }

    mount(h(Comp, null), container)
    expect(container.innerHTML).toBe("<span>pending:false</span>")
  })

  it("returns null data, method, and action", () => {
    const container = document.createElement("div")
    let capturedStatus!: ReturnType<typeof useFormStatus>

    function Comp() {
      capturedStatus = useFormStatus()
      return h("span", null, "test")
    }

    mount(h(Comp, null), container)
    expect(capturedStatus.data).toBeNull()
    expect(capturedStatus.method).toBeNull()
    expect(capturedStatus.action).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// version
// ---------------------------------------------------------------------------

describe("version", () => {
  it("exports a version string", () => {
    expect(version).toBe("0.0.1")
  })
})
