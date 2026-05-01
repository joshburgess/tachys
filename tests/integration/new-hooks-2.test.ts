import { describe, expect, it, vi } from "vitest"
import {
  flushUpdates,
  forwardRef,
  h,
  mount,
  patch,
  startTransition,
  useCallback,
  useDebugValue,
  useDeferredValue,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  useTransition,
} from "../../src/index"
import { hydrate, renderToString } from "../../src/server"
import type { VNode } from "../../src/vnode"

// ---------------------------------------------------------------------------
// useId
// ---------------------------------------------------------------------------

describe("useId", () => {
  it("returns a unique string ID", () => {
    let id1 = ""
    let id2 = ""

    function Comp1() {
      id1 = useId()
      return h("div", null, id1)
    }

    function Comp2() {
      id2 = useId()
      return h("div", null, id2)
    }

    const container = document.createElement("div")
    mount(h(null, null, h(Comp1, null), h(Comp2, null)), container)

    expect(id1).toMatch(/^:b\d+:$/)
    expect(id2).toMatch(/^:b\d+:$/)
    expect(id1).not.toBe(id2)
  })

  it("returns stable IDs across re-renders", () => {
    const ids: string[] = []

    function Comp() {
      const id = useId()
      const [count, setCount] = useState(0)
      ids.push(id)
      return h("button", { onClick: () => setCount((c: number) => c + 1) }, `${id}-${count}`)
    }

    const container = document.createElement("div")
    const vnode1 = h(Comp, null)
    mount(vnode1, container)

    // Trigger a re-render by clicking the button
    container.querySelector("button")!.click()
    flushUpdates()

    expect(ids.length).toBe(2)
    expect(ids[0]).toBe(ids[1])
  })

  it("generates matching IDs for SSR and hydration", () => {
    let ssrId = ""
    let hydrateId = ""

    function Comp() {
      const id = useId()
      return h("div", { id }, "content")
    }

    // SSR
    const ssrVNode = h(Comp, null)
    const html = renderToString(ssrVNode)
    // Extract the id from the rendered HTML
    const match = html.match(/id="([^"]+)"/)
    ssrId = match ? match[1]! : ""

    // Hydrate
    const container = document.createElement("div")
    container.innerHTML = html
    const hydrateVNode = h(Comp, null)
    hydrate(hydrateVNode, container)

    // The component was mounted fresh during hydration, so check its output
    hydrateId = container.firstElementChild!.getAttribute("id") || ""

    // Both should produce IDs with the same prefix pattern
    expect(ssrId).toMatch(/^:b\d+:$/)
    expect(hydrateId).toMatch(/^:b\d+:$/)
    // Since both reset the counter, they should match
    expect(ssrId).toBe(hydrateId)
  })

  it("can be used for label/input pairing", () => {
    function FormField() {
      const id = useId()
      return h("div", null, h("label", { for: id }, "Name"), h("input", { id }))
    }

    const container = document.createElement("div")
    mount(h(FormField, null), container)

    const label = container.querySelector("label")!
    const input = container.querySelector("input")!
    expect(label.getAttribute("for")).toBe(input.getAttribute("id"))
    expect(input.getAttribute("id")).toMatch(/^:b\d+:$/)
  })

  it("multiple useId calls in same component return different IDs", () => {
    let firstId = ""
    let secondId = ""

    function Comp() {
      firstId = useId()
      secondId = useId()
      return h("div", null, `${firstId} ${secondId}`)
    }

    const container = document.createElement("div")
    mount(h(Comp, null), container)

    expect(firstId).not.toBe(secondId)
  })
})

// ---------------------------------------------------------------------------
// useImperativeHandle
// ---------------------------------------------------------------------------

describe("useImperativeHandle", () => {
  it("exposes a custom handle via ref", () => {
    const ref: { current: { focus: () => void } | null } = { current: null }

    const FancyInput = forwardRef((props: Record<string, unknown>, fwdRef) => {
      const inputRef = useRef<HTMLInputElement>(null)

      useImperativeHandle(fwdRef as { current: { focus: () => void } | null }, () => ({
        focus: () => inputRef.current?.focus(),
      }))

      return h("input", { ref: inputRef })
    })

    const container = document.createElement("div")
    mount(h(FancyInput, { ref }), container)

    expect(ref.current).not.toBeNull()
    expect(typeof ref.current!.focus).toBe("function")
  })

  it("works with callback ref", () => {
    let handle: { getValue: () => number } | null = null

    const Comp = forwardRef((_props: Record<string, unknown>, fwdRef) => {
      useImperativeHandle(fwdRef as (instance: { getValue: () => number }) => void, () => ({
        getValue: () => 42,
      }))
      return h("div", null, "hello")
    })

    const container = document.createElement("div")
    mount(
      h(Comp, {
        ref: (h: { getValue: () => number } | null) => {
          handle = h
        },
      }),
      container,
    )

    expect(handle).not.toBeNull()
    expect(handle!.getValue()).toBe(42)
  })

  it("does not crash with null ref", () => {
    function Comp() {
      useImperativeHandle(null, () => ({ test: true }))
      return h("div", null, "ok")
    }

    const container = document.createElement("div")
    expect(() => mount(h(Comp, null), container)).not.toThrow()
  })

  it("updates handle when deps change", () => {
    const ref: { current: { value: number } | null } = { current: null }
    let renderCount = 0

    const Comp = forwardRef((props: Record<string, unknown>, fwdRef) => {
      const val = props["val"] as number
      renderCount++

      useImperativeHandle(fwdRef as { current: { value: number } | null }, () => ({ value: val }), [
        val,
      ])

      return h("div", null, String(val))
    })

    const container = document.createElement("div")
    const v1 = h(Comp, { ref, val: 1 })
    mount(v1, container)
    expect(ref.current!.value).toBe(1)

    const v2 = h(Comp, { ref, val: 2 })
    patch(v1, v2, container)
    expect(ref.current!.value).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// useDebugValue
// ---------------------------------------------------------------------------

describe("useDebugValue", () => {
  it("is a no-op and does not throw", () => {
    function useCustomHook() {
      const [value] = useState(42)
      useDebugValue(value)
      return value
    }

    function Comp() {
      const val = useCustomHook()
      return h("span", null, String(val))
    }

    const container = document.createElement("div")
    expect(() => mount(h(Comp, null), container)).not.toThrow()
    expect(container.innerHTML).toBe("<span>42</span>")
  })

  it("accepts a formatter function without throwing", () => {
    function useCustomHook() {
      const [value] = useState({ count: 5 })
      useDebugValue(value, (v) => `count: ${v.count}`)
      return value
    }

    function Comp() {
      const val = useCustomHook()
      return h("span", null, String(val.count))
    }

    const container = document.createElement("div")
    expect(() => mount(h(Comp, null), container)).not.toThrow()
    expect(container.innerHTML).toBe("<span>5</span>")
  })
})

// ---------------------------------------------------------------------------
// startTransition
// ---------------------------------------------------------------------------

describe("startTransition", () => {
  it("executes the callback synchronously", () => {
    let called = false
    startTransition(() => {
      called = true
    })
    expect(called).toBe(true)
  })

  it("batches state updates inside the callback", () => {
    let renderCount = 0

    function Comp() {
      const [a, setA] = useState(0)
      const [b, setB] = useState(0)
      renderCount++

      const onClick = useCallback(() => {
        startTransition(() => {
          setA(1)
          setB(1)
        })
      }, [])

      return h("button", { onClick }, `${a},${b}`)
    }

    const container = document.createElement("div")
    mount(h(Comp, null), container)
    expect(container.innerHTML).toBe("<button>0,0</button>")

    container.querySelector("button")!.click()
    flushUpdates()
    expect(container.innerHTML).toBe("<button>1,1</button>")
  })
})

// ---------------------------------------------------------------------------
// useTransition
// ---------------------------------------------------------------------------

describe("useTransition", () => {
  it("returns [false, startTransition]", () => {
    let result: readonly [boolean, (cb: () => void) => void] | null = null

    function Comp() {
      result = useTransition()
      return h("div", null, "test")
    }

    const container = document.createElement("div")
    mount(h(Comp, null), container)

    expect(result).not.toBeNull()
    expect(result![0]).toBe(false)
    expect(typeof result![1]).toBe("function")
  })

  it("startTransition from useTransition triggers state updates", () => {
    function Comp() {
      const [count, setCount] = useState(0)
      const [, doTransition] = useTransition()

      return h(
        "button",
        {
          onClick: () => {
            doTransition(() => setCount((c: number) => c + 1))
          },
        },
        String(count),
      )
    }

    const container = document.createElement("div")
    mount(h(Comp, null), container)
    expect(container.innerHTML).toBe("<button>0</button>")

    container.querySelector("button")!.click()
    flushUpdates()
    expect(container.innerHTML).toBe("<button>1</button>")
  })
})

// ---------------------------------------------------------------------------
// useDeferredValue
// ---------------------------------------------------------------------------

describe("useDeferredValue", () => {
  it("returns the same value (synchronous model)", () => {
    let deferred: string | null = null

    function Comp() {
      const [value] = useState("hello")
      deferred = useDeferredValue(value)
      return h("span", null, deferred)
    }

    const container = document.createElement("div")
    mount(h(Comp, null), container)

    expect(deferred).toBe("hello")
    expect(container.innerHTML).toBe("<span>hello</span>")
  })

  it("updates immediately when the source value changes", () => {
    function Comp() {
      const [value, setValue] = useState("initial")
      const deferred = useDeferredValue(value)

      return h("button", { onClick: () => setValue("updated") }, deferred)
    }

    const container = document.createElement("div")
    mount(h(Comp, null), container)
    expect(container.innerHTML).toBe("<button>initial</button>")

    container.querySelector("button")!.click()
    flushUpdates()
    expect(container.innerHTML).toBe("<button>updated</button>")
  })

  it("works with object values", () => {
    const obj = { x: 1, y: 2 }
    let deferred: typeof obj | null = null

    function Comp() {
      deferred = useDeferredValue(obj)
      return h("div", null, JSON.stringify(deferred))
    }

    const container = document.createElement("div")
    mount(h(Comp, null), container)
    expect(deferred).toBe(obj)
  })

  it("returns initialValue on first render when provided", () => {
    const snapshots: string[] = []

    function Comp() {
      const deferred = useDeferredValue("current", "placeholder")
      snapshots.push(deferred)
      return h("span", null, deferred)
    }

    const container = document.createElement("div")
    mount(h(Comp, null), container)

    // First render should use initialValue
    expect(snapshots[0]).toBe("placeholder")
    expect(container.innerHTML).toBe("<span>placeholder</span>")

    // After flushing the Transition update, should catch up to current value
    flushUpdates()
    expect(snapshots[snapshots.length - 1]).toBe("current")
    expect(container.innerHTML).toBe("<span>current</span>")
  })

  it("returns value directly on first render without initialValue", () => {
    let deferred: string | null = null

    function Comp() {
      deferred = useDeferredValue("current")
      return h("span", null, deferred)
    }

    const container = document.createElement("div")
    mount(h(Comp, null), container)

    expect(deferred).toBe("current")
  })

  it("initialValue does not affect subsequent updates", () => {
    let setValue: ((v: string) => void) | null = null
    const snapshots: string[] = []

    function Comp() {
      const [value, sv] = useState("first")
      setValue = sv
      const deferred = useDeferredValue(value, "init")
      snapshots.push(deferred)
      return h("span", null, deferred)
    }

    const container = document.createElement("div")
    mount(h(Comp, null), container)

    // First render: initialValue
    expect(snapshots[0]).toBe("init")

    // Flush to catch up
    flushUpdates()
    expect(snapshots[snapshots.length - 1]).toBe("first")

    // Update value -- initialValue should have no effect
    setValue!("second")
    flushUpdates()
    expect(snapshots[snapshots.length - 1]).toBe("second")
    expect(container.innerHTML).toBe("<span>second</span>")
  })
})
