import { describe, expect, it, vi } from "vitest"
import {
  flushUpdates,
  h,
  mount,
  patch,
  unmount,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "../../src/index"
import type { VNode } from "../../src/vnode"

describe("component model", () => {
  let container: HTMLDivElement

  function setup(): HTMLDivElement {
    return document.createElement("div")
  }

  describe("functional components with hooks", () => {
    it("should render with useState", async () => {
      container = setup()
      let setter: (v: number | ((p: number) => number)) => void

      function Counter() {
        const [count, setCount] = useState(0)
        setter = setCount
        return h("span", null, `count: ${count}`)
      }

      mount(h(Counter, null), container)
      expect(container.innerHTML).toBe("<span>count: 0</span>")

      setter!(1)
      await flushMicrotasks()
      expect(container.innerHTML).toBe("<span>count: 1</span>")
    })

    it("should support functional updates with useState", async () => {
      container = setup()
      let setter: (v: number | ((p: number) => number)) => void

      function Counter() {
        const [count, setCount] = useState(10)
        setter = setCount
        return h("span", null, `${count}`)
      }

      mount(h(Counter, null), container)
      expect(container.innerHTML).toBe("<span>10</span>")

      setter!((prev) => prev + 5)
      await flushMicrotasks()
      expect(container.innerHTML).toBe("<span>15</span>")
    })

    it("should batch multiple setState calls into one render", async () => {
      container = setup()
      let renderCount = 0
      let setter: (v: number | ((p: number) => number)) => void

      function Counter() {
        const [count, setCount] = useState(0)
        setter = setCount
        renderCount++
        return h("span", null, `${count}`)
      }

      mount(h(Counter, null), container)
      expect(renderCount).toBe(1)

      // Three synchronous setState calls
      setter!(1)
      setter!(2)
      setter!(3)

      await flushMicrotasks()

      // Should have batched into a single re-render
      expect(renderCount).toBe(2)
      expect(container.innerHTML).toBe("<span>3</span>")
    })

    it("should not re-render when setState to same value", async () => {
      container = setup()
      let renderCount = 0
      let setter: (v: number | ((p: number) => number)) => void

      function Counter() {
        const [count, setCount] = useState(5)
        setter = setCount
        renderCount++
        return h("span", null, `${count}`)
      }

      mount(h(Counter, null), container)
      expect(renderCount).toBe(1)

      setter!(5) // Same value
      await flushMicrotasks()

      expect(renderCount).toBe(1) // No re-render
    })

    it("should support multiple useState hooks", async () => {
      container = setup()
      let setName: (v: string) => void
      let setAge: (v: number) => void

      function Profile() {
        const [name, sn] = useState("Alice")
        const [age, sa] = useState(30)
        setName = sn
        setAge = sa
        return h("div", null, `${name}, age ${age}`)
      }

      mount(h(Profile, null), container)
      expect(container.innerHTML).toBe("<div>Alice, age 30</div>")

      setName!("Bob")
      await flushMicrotasks()
      expect(container.innerHTML).toBe("<div>Bob, age 30</div>")

      setAge!(25)
      await flushMicrotasks()
      expect(container.innerHTML).toBe("<div>Bob, age 25</div>")
    })
  })

  describe("useEffect", () => {
    it("should fire effect after mount", () => {
      container = setup()
      const effectFn = vi.fn()

      function Comp() {
        useEffect(effectFn)
        return h("div", null, "test")
      }

      mount(h(Comp, null), container)
      expect(effectFn).toHaveBeenCalledTimes(1)
    })

    it("should fire effect after every render when no deps", async () => {
      container = setup()
      const effectFn = vi.fn()
      let setter: (v: number) => void

      function Comp() {
        const [count, setCount] = useState(0)
        setter = setCount
        useEffect(effectFn)
        return h("div", null, `${count}`)
      }

      mount(h(Comp, null), container)
      expect(effectFn).toHaveBeenCalledTimes(1)

      setter!(1)
      await flushMicrotasks()
      expect(effectFn).toHaveBeenCalledTimes(2)
    })

    it("should only fire once with empty deps array", async () => {
      container = setup()
      const effectFn = vi.fn()
      let setter: (v: number) => void

      function Comp() {
        const [count, setCount] = useState(0)
        setter = setCount
        useEffect(effectFn, [])
        return h("div", null, `${count}`)
      }

      mount(h(Comp, null), container)
      expect(effectFn).toHaveBeenCalledTimes(1)

      setter!(1)
      await flushMicrotasks()
      expect(effectFn).toHaveBeenCalledTimes(1) // Still 1 — deps didn't change
    })

    it("should fire effect when deps change", async () => {
      container = setup()
      const effectFn = vi.fn()
      let setter: (v: number) => void

      function Comp() {
        const [count, setCount] = useState(0)
        setter = setCount
        useEffect(effectFn, [count])
        return h("div", null, `${count}`)
      }

      mount(h(Comp, null), container)
      expect(effectFn).toHaveBeenCalledTimes(1)

      setter!(1)
      await flushMicrotasks()
      expect(effectFn).toHaveBeenCalledTimes(2) // Dep changed

      setter!(1) // Same value — no re-render
      await flushMicrotasks()
      expect(effectFn).toHaveBeenCalledTimes(2)
    })

    it("should run cleanup before re-running effect", async () => {
      container = setup()
      const cleanup = vi.fn()
      const effectFn = vi.fn(() => cleanup)
      let setter: (v: number) => void

      function Comp() {
        const [count, setCount] = useState(0)
        setter = setCount
        useEffect(effectFn, [count])
        return h("div", null, `${count}`)
      }

      mount(h(Comp, null), container)
      expect(effectFn).toHaveBeenCalledTimes(1)
      expect(cleanup).not.toHaveBeenCalled()

      setter!(1)
      await flushMicrotasks()
      expect(cleanup).toHaveBeenCalledTimes(1) // Cleanup ran before re-running effect
      expect(effectFn).toHaveBeenCalledTimes(2)
    })

    it("should run cleanup on unmount", () => {
      container = setup()
      const cleanup = vi.fn()

      function Comp() {
        useEffect(() => cleanup, [])
        return h("div", null, "test")
      }

      const vnode = h(Comp, null)
      mount(vnode, container)
      expect(cleanup).not.toHaveBeenCalled()

      // Unmount via patch to a different element
      const replacement = h("span", null, "replaced")
      patch(vnode, replacement, container)

      // The component was replaced, so cleanup should have run
      // Note: since the type changed (Component -> Element), replaceVNode is called
      expect(cleanup).toHaveBeenCalledTimes(1)
    })
  })

  describe("shouldUpdate (shallow prop equality)", () => {
    it("should skip re-render when props are shallowly equal", () => {
      container = setup()
      let renderCount = 0

      function Child(props: Record<string, unknown>) {
        renderCount++
        return h("span", null, `${props["value"]}`)
      }

      const old = h(Child, { value: "hello" })
      mount(old, container)
      expect(renderCount).toBe(1)

      // Patch with same props
      const next = h(Child, { value: "hello" })
      patch(old, next, container)
      expect(renderCount).toBe(1) // Skipped re-render
      expect(container.innerHTML).toBe("<span>hello</span>")
    })

    it("should re-render when props change", () => {
      container = setup()
      let renderCount = 0

      function Child(props: Record<string, unknown>) {
        renderCount++
        return h("span", null, `${props["value"]}`)
      }

      const old = h(Child, { value: "hello" })
      mount(old, container)
      expect(renderCount).toBe(1)

      const next = h(Child, { value: "world" })
      patch(old, next, container)
      expect(renderCount).toBe(2)
      expect(container.innerHTML).toBe("<span>world</span>")
    })
  })

  describe("component re-render with patch", () => {
    it("should re-render component when parent patches with new props", () => {
      container = setup()

      function Greeting(props: Record<string, unknown>) {
        return h("span", null, `hello ${props["name"]}`)
      }

      const old = h(Greeting, { name: "world" })
      mount(old, container)
      expect(container.innerHTML).toBe("<span>hello world</span>")

      const next = h(Greeting, { name: "everyone" })
      patch(old, next, container)
      expect(container.innerHTML).toBe("<span>hello everyone</span>")
    })
  })
})

describe("hook ordering with mixed hook types", () => {
  it("should maintain correct hookIndex across useState, useMemo, useRef, and useEffect", async () => {
    const container: HTMLDivElement = document.createElement("div")
    let setter: (v: number) => void
    const effectFn = vi.fn()

    function Mixed() {
      const [count, setCount] = useState(0)
      setter = setCount
      const doubled = useMemo(() => count * 2, [count])
      const renderRef = useRef(0)
      renderRef.current += 1
      useEffect(effectFn)
      return h("div", null, `count:${count} doubled:${doubled} renders:${renderRef.current}`)
    }

    mount(h(Mixed, null), container)
    expect(container.innerHTML).toBe("<div>count:0 doubled:0 renders:1</div>")
    expect(effectFn).toHaveBeenCalledTimes(1)

    setter!(3)
    await flushMicrotasks()
    expect(container.innerHTML).toBe("<div>count:3 doubled:6 renders:2</div>")
    expect(effectFn).toHaveBeenCalledTimes(2)

    setter!(5)
    await flushMicrotasks()
    expect(container.innerHTML).toBe("<div>count:5 doubled:10 renders:3</div>")
    expect(effectFn).toHaveBeenCalledTimes(3)
  })
})

describe("multiple useEffect hooks", () => {
  it("should run both effects on mount, only changed dep effect on update, both cleanups on unmount", async () => {
    const container: HTMLDivElement = document.createElement("div")
    let setA: (v: number) => void
    let setB: (v: number) => void
    const cleanupA = vi.fn()
    const cleanupB = vi.fn()
    const effectA = vi.fn(() => cleanupA)
    const effectB = vi.fn(() => cleanupB)

    function TwoEffects() {
      const [a, sA] = useState(0)
      const [b, sB] = useState(0)
      setA = sA
      setB = sB
      useEffect(effectA, [a])
      useEffect(effectB, [b])
      return h("div", null, `a:${a} b:${b}`)
    }

    const vnode = h(TwoEffects, null)
    mount(vnode, container)

    // Both effects run on mount
    expect(effectA).toHaveBeenCalledTimes(1)
    expect(effectB).toHaveBeenCalledTimes(1)

    // Only dep A changes -- only effectA re-runs
    setA!(1)
    await flushMicrotasks()
    expect(effectA).toHaveBeenCalledTimes(2)
    expect(cleanupA).toHaveBeenCalledTimes(1)
    expect(effectB).toHaveBeenCalledTimes(1)
    expect(cleanupB).toHaveBeenCalledTimes(0)

    // Unmount -- both cleanups fire
    const replacement = h("span", null, "gone")
    patch(vnode, replacement, container)
    expect(cleanupA).toHaveBeenCalledTimes(2)
    expect(cleanupB).toHaveBeenCalledTimes(1)
  })
})

describe("useEffect cleanup with no deps", () => {
  it("should run cleanup from previous render before the next effect when deps is undefined", async () => {
    const container: HTMLDivElement = document.createElement("div")
    let setter: (v: number) => void
    const calls: string[] = []

    function Comp() {
      const [count, setCount] = useState(0)
      setter = setCount
      useEffect(() => {
        const captured = count
        calls.push(`effect:${captured}`)
        return () => {
          calls.push(`cleanup:${captured}`)
        }
      })
      return h("div", null, `${count}`)
    }

    mount(h(Comp, null), container)
    expect(calls).toEqual(["effect:0"])

    setter!(1)
    await flushMicrotasks()
    // cleanup from render 0 runs before effect from render 1
    expect(calls).toEqual(["effect:0", "cleanup:0", "effect:1"])

    setter!(2)
    await flushMicrotasks()
    expect(calls).toEqual(["effect:0", "cleanup:0", "effect:1", "cleanup:1", "effect:2"])
  })
})

describe("useMemo dep revert", () => {
  it("should recompute when deps change even if they revert to a previous value", async () => {
    const container: HTMLDivElement = document.createElement("div")
    let setter: (v: number) => void
    let computeCount = 0

    function Comp() {
      const [val, setVal] = useState(0)
      setter = setVal
      const memoized = useMemo(() => {
        computeCount++
        return val * 10
      }, [val])
      return h("div", null, `${memoized}`)
    }

    mount(h(Comp, null), container)
    expect(computeCount).toBe(1)
    expect(container.innerHTML).toBe("<div>0</div>")

    setter!(1)
    await flushMicrotasks()
    expect(computeCount).toBe(2)
    expect(container.innerHTML).toBe("<div>10</div>")

    // Revert back to 0 -- should recompute again, not use old cached value
    setter!(0)
    await flushMicrotasks()
    expect(computeCount).toBe(3)
    expect(container.innerHTML).toBe("<div>0</div>")
  })
})

describe("buildComponentProps passes children", () => {
  it("should set props.children when a component receives child VNodes", () => {
    const container: HTMLDivElement = document.createElement("div")
    let receivedChildren: unknown = undefined

    function Wrapper(props: Record<string, unknown>) {
      receivedChildren = props["children"]
      return h("div", null, "wrapper")
    }

    const child = h("span", null, "hello")
    mount(h(Wrapper, null, child), container)

    // children should be the child VNode passed in
    expect(receivedChildren).toBe(child)
  })
})

describe("shallowEqual prop count mismatch", () => {
  it("should re-render when a new prop is added even if existing props are the same", () => {
    const container: HTMLDivElement = document.createElement("div")
    let renderCount = 0

    function Child(props: Record<string, unknown>) {
      renderCount++
      const extra = props["extra"] !== undefined ? ` extra:${props["extra"]}` : ""
      return h("span", null, `${props["value"]}${extra}`)
    }

    const old = h(Child, { value: "hello" })
    mount(old, container)
    expect(renderCount).toBe(1)
    expect(container.innerHTML).toBe("<span>hello</span>")

    // Same "value" prop but an additional "extra" prop added
    const next = h(Child, { value: "hello", extra: "yes" })
    patch(old, next, container)
    expect(renderCount).toBe(2)
    expect(container.innerHTML).toBe("<span>hello extra:yes</span>")
  })
})

describe("effect cleanup in deeply nested unmount", () => {
  it("should run effect cleanup when component is unmounted via parent element removal", () => {
    const container: HTMLDivElement = document.createElement("div")
    const cleanup = vi.fn()

    function Inner() {
      useEffect(() => cleanup, [])
      return h("span", null, "inner")
    }

    // Mount: div > Inner component
    const innerVNode = h(Inner, null)
    const outerVNode = h("div", null, innerVNode)
    mount(outerVNode, container)
    expect(cleanup).not.toHaveBeenCalled()

    // Unmount the outer div -- clearVNodeTree path should fire Inner's cleanup
    unmount(outerVNode, container)
    expect(cleanup).toHaveBeenCalledTimes(1)
  })
})

function flushMicrotasks(): Promise<void> {
  flushUpdates()
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}
