import { describe, expect, it, vi } from "vitest"
import {
  flushUpdates,
  h,
  mount,
  patch,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "../../src/index"
import type { VNode } from "../../src/vnode"

function flushMicrotasks(): Promise<void> {
  flushUpdates()
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

describe("useMemo", () => {
  let container: HTMLDivElement

  function setup(): HTMLDivElement {
    return document.createElement("div")
  }

  it("should compute value on first render", () => {
    container = setup()
    const factory = vi.fn(() => 42)

    function Comp() {
      const value = useMemo(factory, [])
      return h("span", null, String(value))
    }

    mount(h(Comp, null), container)
    expect(container.innerHTML).toBe("<span>42</span>")
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it("should not recompute when deps are unchanged", async () => {
    container = setup()
    const factory = vi.fn(() => "expensive")
    let setter: (v: number) => void

    function Comp() {
      const [count, setCount] = useState(0)
      setter = setCount
      const value = useMemo(factory, []) // empty deps — never recompute
      return h("div", null, `${value}-${count}`)
    }

    mount(h(Comp, null), container)
    expect(factory).toHaveBeenCalledTimes(1)

    setter!(1)
    await flushMicrotasks()
    expect(factory).toHaveBeenCalledTimes(1) // Still 1
    expect(container.innerHTML).toBe("<div>expensive-1</div>")
  })

  it("should recompute when deps change", async () => {
    container = setup()
    let computeCount = 0
    let setter: (v: number) => void

    function Comp() {
      const [count, setCount] = useState(0)
      setter = setCount
      const doubled = useMemo(() => {
        computeCount++
        return count * 2
      }, [count])
      return h("span", null, String(doubled))
    }

    mount(h(Comp, null), container)
    expect(computeCount).toBe(1)
    expect(container.innerHTML).toBe("<span>0</span>")

    setter!(5)
    await flushMicrotasks()
    expect(computeCount).toBe(2)
    expect(container.innerHTML).toBe("<span>10</span>")
  })

  it("should return same reference when deps unchanged", async () => {
    container = setup()
    const objects: object[] = []
    let setter: (v: number) => void

    function Comp() {
      const [count, setCount] = useState(0)
      setter = setCount
      const obj = useMemo(() => ({ stable: true }), [])
      objects.push(obj)
      return h("div", null, String(count))
    }

    mount(h(Comp, null), container)
    setter!(1)
    await flushMicrotasks()

    expect(objects.length).toBe(2)
    expect(objects[0]).toBe(objects[1]) // Same reference
  })
})

describe("useCallback", () => {
  let container: HTMLDivElement

  function setup(): HTMLDivElement {
    return document.createElement("div")
  }

  it("should return same function reference when deps unchanged", async () => {
    container = setup()
    const callbacks: Array<() => void> = []
    let setter: (v: number) => void

    function Comp() {
      const [count, setCount] = useState(0)
      setter = setCount
      const cb = useCallback(() => {}, [])
      callbacks.push(cb)
      return h("div", null, String(count))
    }

    mount(h(Comp, null), container)
    setter!(1)
    await flushMicrotasks()

    expect(callbacks.length).toBe(2)
    expect(callbacks[0]).toBe(callbacks[1]) // Same reference
  })

  it("should return new function reference when deps change", async () => {
    container = setup()
    const callbacks: Array<() => number> = []
    let setter: (v: number) => void

    function Comp() {
      const [count, setCount] = useState(0)
      setter = setCount
      const cb = useCallback(() => count, [count])
      callbacks.push(cb)
      return h("div", null, String(count))
    }

    mount(h(Comp, null), container)
    setter!(1)
    await flushMicrotasks()

    expect(callbacks.length).toBe(2)
    expect(callbacks[0]).not.toBe(callbacks[1]) // Different reference
    expect(callbacks[1]!()).toBe(1) // Closes over new count
  })
})

describe("useRef", () => {
  let container: HTMLDivElement

  function setup(): HTMLDivElement {
    return document.createElement("div")
  }

  it("should return initial value on first render", () => {
    container = setup()

    function Comp() {
      const ref = useRef(42)
      return h("span", null, String(ref.current))
    }

    mount(h(Comp, null), container)
    expect(container.innerHTML).toBe("<span>42</span>")
  })

  it("should return same ref object across renders", async () => {
    container = setup()
    const refs: Array<{ current: number }> = []
    let setter: (v: number) => void

    function Comp() {
      const [count, setCount] = useState(0)
      setter = setCount
      const ref = useRef(0)
      refs.push(ref)
      return h("div", null, String(count))
    }

    mount(h(Comp, null), container)
    setter!(1)
    await flushMicrotasks()

    expect(refs.length).toBe(2)
    expect(refs[0]).toBe(refs[1]) // Same object
  })

  it("should allow mutation of current without triggering re-render", async () => {
    container = setup()
    let renderCount = 0
    let setter: (v: number) => void
    let refObj: { current: number }

    function Comp() {
      const [count, setCount] = useState(0)
      setter = setCount
      const ref = useRef(0)
      refObj = ref
      renderCount++
      return h("div", null, String(count))
    }

    mount(h(Comp, null), container)
    expect(renderCount).toBe(1)

    // Mutating ref.current does not trigger re-render
    refObj!.current = 999
    await flushMicrotasks()
    expect(renderCount).toBe(1)

    // But the value persists across renders
    setter!(1)
    await flushMicrotasks()
    expect(renderCount).toBe(2)
    expect(refObj!.current).toBe(999)
  })

  it("should work with null initial for DOM ref pattern", () => {
    container = setup()

    function Comp() {
      const ref = useRef<Element | null>(null)
      return h("div", { ref }, "hello")
    }

    mount(h(Comp, null), container)
    // The ref callback from the div prop should not conflict with useRef
    // (they are different mechanisms)
  })
})
