import { describe, expect, it, vi } from "vitest"
import {
  flushUpdates,
  h,
  mount,
  patch,
  unmount,
  useEffect,
  useLayoutEffect,
  useReducer,
  useState,
} from "../../src/index"
import type { VNode } from "../../src/vnode"

// Flush the microtask queue so scheduled re-renders run before assertions.
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

// ---------------------------------------------------------------------------
// useReducer
// ---------------------------------------------------------------------------

describe("useReducer", () => {
  it("returns initial state on mount", () => {
    const container = document.createElement("div")

    function Comp() {
      const [count] = useReducer((s: number, a: number) => s + a, 0)
      return h("span", null, String(count))
    }

    mount(h(Comp, null), container)
    expect(container.innerHTML).toBe("<span>0</span>")
  })

  it("dispatch triggers re-render with new state", async () => {
    const container = document.createElement("div")
    let dispatch!: (action: number) => void

    function Comp() {
      const [count, d] = useReducer((s: number, a: number) => s + a, 0)
      dispatch = d
      return h("span", null, String(count))
    }

    mount(h(Comp, null), container)
    expect(container.innerHTML).toBe("<span>0</span>")

    dispatch(5)
    await flushMicrotasks()
    expect(container.innerHTML).toBe("<span>5</span>")
  })

  it("handles multiple action types: increment / decrement / reset", async () => {
    const container = document.createElement("div")

    type Action = { type: "inc" } | { type: "dec" } | { type: "reset" }

    function reducer(state: number, action: Action): number {
      switch (action.type) {
        case "inc":
          return state + 1
        case "dec":
          return state - 1
        case "reset":
          return 0
        default:
          return state
      }
    }

    let dispatch!: (action: Action) => void

    function Counter() {
      const [count, d] = useReducer(reducer, 10)
      dispatch = d
      return h("span", null, String(count))
    }

    mount(h(Counter, null), container)
    expect(container.innerHTML).toBe("<span>10</span>")

    dispatch({ type: "inc" })
    await flushMicrotasks()
    expect(container.innerHTML).toBe("<span>11</span>")

    dispatch({ type: "dec" })
    await flushMicrotasks()
    expect(container.innerHTML).toBe("<span>10</span>")

    dispatch({ type: "reset" })
    await flushMicrotasks()
    expect(container.innerHTML).toBe("<span>0</span>")
  })

  it("does NOT re-render when reducer returns the same reference", async () => {
    const container = document.createElement("div")
    let renderCount = 0
    let dispatch!: (action: string) => void

    // Reducer that returns the same state for unknown actions.
    function reducer(state: number, action: string): number {
      if (action === "inc") return state + 1
      return state // same reference — no change
    }

    function Comp() {
      const [count, d] = useReducer(reducer, 0)
      dispatch = d
      renderCount++
      return h("span", null, String(count))
    }

    mount(h(Comp, null), container)
    expect(renderCount).toBe(1)

    dispatch("noop") // reducer returns same primitive value
    await flushMicrotasks()
    expect(renderCount).toBe(1) // no re-render
    expect(container.innerHTML).toBe("<span>0</span>")
  })

  it("works alongside useState in the same component", async () => {
    const container = document.createElement("div")
    let setLabel!: (v: string) => void
    let dispatchCount!: (a: number) => void

    function Comp() {
      const [count, d] = useReducer((s: number, a: number) => s + a, 0)
      const [label, setL] = useState("hello")
      dispatchCount = d
      setLabel = setL
      return h("div", null, `${label}:${count}`)
    }

    mount(h(Comp, null), container)
    expect(container.innerHTML).toBe("<div>hello:0</div>")

    dispatchCount(3)
    await flushMicrotasks()
    expect(container.innerHTML).toBe("<div>hello:3</div>")

    setLabel("world")
    await flushMicrotasks()
    expect(container.innerHTML).toBe("<div>world:3</div>")
  })

  it("multiple dispatches batch into one re-render", async () => {
    const container = document.createElement("div")
    let renderCount = 0
    let dispatch!: (a: number) => void

    function Comp() {
      const [count, d] = useReducer((s: number, a: number) => s + a, 0)
      dispatch = d
      renderCount++
      return h("span", null, String(count))
    }

    mount(h(Comp, null), container)
    expect(renderCount).toBe(1)

    // Three dispatches synchronously — should batch into one re-render.
    dispatch(1)
    dispatch(1)
    dispatch(1)

    // Only the last scheduled state is visible because each dispatch immediately
    // updates the hook slot before the next dispatch reads it — same behaviour
    // as useState batching.
    await flushMicrotasks()
    expect(renderCount).toBe(2)
    // Each dispatch saw the value from the previous one: 0+1=1, 1+1=2, 2+1=3.
    expect(container.innerHTML).toBe("<span>3</span>")
  })

  it("works with complex state objects returned from reducer", async () => {
    const container = document.createElement("div")

    interface UserState {
      name: string
      age: number
    }

    type UserAction =
      | { type: "setName"; name: string }
      | { type: "birthday" }

    function reducer(state: UserState, action: UserAction): UserState {
      switch (action.type) {
        case "setName":
          return { ...state, name: action.name }
        case "birthday":
          return { ...state, age: state.age + 1 }
        default:
          return state
      }
    }

    let dispatch!: (a: UserAction) => void

    function Profile() {
      const [user, d] = useReducer(reducer, { name: "Alice", age: 30 })
      dispatch = d
      return h("div", null, `${user.name}, age ${user.age}`)
    }

    mount(h(Profile, null), container)
    expect(container.innerHTML).toBe("<div>Alice, age 30</div>")

    dispatch({ type: "setName", name: "Bob" })
    await flushMicrotasks()
    expect(container.innerHTML).toBe("<div>Bob, age 30</div>")

    dispatch({ type: "birthday" })
    await flushMicrotasks()
    expect(container.innerHTML).toBe("<div>Bob, age 31</div>")
  })
})

// ---------------------------------------------------------------------------
// useLayoutEffect
// ---------------------------------------------------------------------------

describe("useLayoutEffect", () => {
  it("fires after mount (like useEffect)", () => {
    const container = document.createElement("div")
    const effectFn = vi.fn()

    function Comp() {
      useLayoutEffect(effectFn)
      return h("div", null, "test")
    }

    mount(h(Comp, null), container)
    expect(effectFn).toHaveBeenCalledTimes(1)
  })

  it("fires on every render when no deps array is provided", async () => {
    const container = document.createElement("div")
    const effectFn = vi.fn()
    let setter!: (v: number) => void

    function Comp() {
      const [count, setCount] = useState(0)
      setter = setCount
      useLayoutEffect(effectFn) // no deps — runs every render
      return h("div", null, String(count))
    }

    mount(h(Comp, null), container)
    expect(effectFn).toHaveBeenCalledTimes(1)

    setter(1)
    await flushMicrotasks()
    expect(effectFn).toHaveBeenCalledTimes(2)

    setter(2)
    await flushMicrotasks()
    expect(effectFn).toHaveBeenCalledTimes(3)
  })

  it("fires only when deps change", async () => {
    const container = document.createElement("div")
    const effectFn = vi.fn()
    let setA!: (v: number) => void
    let setB!: (v: number) => void

    function Comp() {
      const [a, sA] = useState(0)
      const [b, sB] = useState(0)
      setA = sA
      setB = sB
      useLayoutEffect(effectFn, [a]) // only depends on `a`
      return h("div", null, `${a}:${b}`)
    }

    mount(h(Comp, null), container)
    expect(effectFn).toHaveBeenCalledTimes(1)

    // Changing `b` does NOT retrigger the layout effect.
    setB(99)
    await flushMicrotasks()
    expect(effectFn).toHaveBeenCalledTimes(1)

    // Changing `a` DOES retrigger it.
    setA(1)
    await flushMicrotasks()
    expect(effectFn).toHaveBeenCalledTimes(2)
  })

  it("with empty deps fires exactly once", async () => {
    const container = document.createElement("div")
    const effectFn = vi.fn()
    let setter!: (v: number) => void

    function Comp() {
      const [count, setCount] = useState(0)
      setter = setCount
      useLayoutEffect(effectFn, []) // empty deps — fire once
      return h("div", null, String(count))
    }

    mount(h(Comp, null), container)
    expect(effectFn).toHaveBeenCalledTimes(1)

    setter(1)
    await flushMicrotasks()
    expect(effectFn).toHaveBeenCalledTimes(1) // still 1

    setter(2)
    await flushMicrotasks()
    expect(effectFn).toHaveBeenCalledTimes(1) // still 1
  })

  it("cleanup runs before re-running the effect", async () => {
    const container = document.createElement("div")
    const cleanup = vi.fn()
    const effectFn = vi.fn(() => cleanup)
    let setter!: (v: number) => void

    function Comp() {
      const [count, setCount] = useState(0)
      setter = setCount
      useLayoutEffect(effectFn, [count])
      return h("div", null, String(count))
    }

    mount(h(Comp, null), container)
    expect(effectFn).toHaveBeenCalledTimes(1)
    expect(cleanup).not.toHaveBeenCalled()

    setter(1)
    await flushMicrotasks()
    expect(cleanup).toHaveBeenCalledTimes(1) // cleanup ran before re-running
    expect(effectFn).toHaveBeenCalledTimes(2)
  })

  it("cleanup runs on unmount", () => {
    const container = document.createElement("div")
    const cleanup = vi.fn()

    function Comp() {
      useLayoutEffect(() => cleanup, [])
      return h("div", null, "test")
    }

    const vnode = h(Comp, null)
    mount(vnode, container)
    expect(cleanup).not.toHaveBeenCalled()

    // Replacing the component with a different type causes the old component to
    // be unmounted, which should trigger the effect cleanup.
    const replacement = h("span", null, "replaced")
    patch(vnode, replacement, container)
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it("works alongside useEffect in the same component — both fire", async () => {
    const container = document.createElement("div")
    const layoutEffectFn = vi.fn()
    const effectFn = vi.fn()
    let setter!: (v: number) => void

    function Comp() {
      const [count, setCount] = useState(0)
      setter = setCount
      useLayoutEffect(layoutEffectFn, [count])
      useEffect(effectFn, [count])
      return h("div", null, String(count))
    }

    mount(h(Comp, null), container)
    // Both should fire on mount.
    expect(layoutEffectFn).toHaveBeenCalledTimes(1)
    expect(effectFn).toHaveBeenCalledTimes(1)

    setter(1)
    await flushMicrotasks()
    // Both should fire again when the dep changes.
    expect(layoutEffectFn).toHaveBeenCalledTimes(2)
    expect(effectFn).toHaveBeenCalledTimes(2)
  })

  it("useLayoutEffect is the same function reference as useEffect", () => {
    // In Phasm, useLayoutEffect is literally defined as useEffect.
    // This verifies the === identity guarantee.
    expect(useLayoutEffect).toBe(useEffect)
  })
})
