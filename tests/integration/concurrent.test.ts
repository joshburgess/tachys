/**
 * Tests for concurrent rendering features:
 * - startTransition
 * - useTransition
 * - useDeferredValue
 * - Lane-based priority scheduling in component context
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  flushUpdates,
  h,
  render,
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useState,
  useTransition,
} from "../../src"
import { Lane, getCurrentLane, scheduleUpdate, setCurrentLane } from "../../src/scheduler"

let container: HTMLDivElement

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  setCurrentLane(Lane.Default)

  return () => {
    render(null, container)
    document.body.removeChild(container)
  }
})

// ---------------------------------------------------------------------------
// startTransition
// ---------------------------------------------------------------------------

describe("startTransition", () => {
  it("sets lane to Transition during callback execution", () => {
    let laneInsideTransition: number | null = null

    startTransition(() => {
      laneInsideTransition = getCurrentLane()
    })

    expect(laneInsideTransition).toBe(Lane.Transition)
  })

  it("restores previous lane after callback", () => {
    expect(getCurrentLane()).toBe(Lane.Default)

    startTransition(() => {
      // inside: Transition
    })

    expect(getCurrentLane()).toBe(Lane.Default)
  })

  it("restores lane even if callback throws", () => {
    expect(getCurrentLane()).toBe(Lane.Default)

    expect(() => {
      startTransition(() => {
        throw new Error("oops")
      })
    }).toThrow("oops")

    expect(getCurrentLane()).toBe(Lane.Default)
  })

  it("schedules state updates at Transition priority", () => {
    let setter: ((v: number) => void) | null = null

    function App() {
      const [count, setCount] = useState(0)
      setter = setCount
      return h("div", null, String(count))
    }

    render(h(App, null), container)
    flushUpdates()
    expect(container.textContent).toBe("0")

    startTransition(() => {
      setter!(42)
    })
    flushUpdates()

    expect(container.textContent).toBe("42")
  })

  it("transition updates are lower priority than default updates", () => {
    const renderOrder: string[] = []
    let setDefault: ((v: number) => void) | null = null
    let setTransition: ((v: number) => void) | null = null

    function DefaultComponent() {
      const [val, setVal] = useState(0)
      setDefault = setVal
      if (val > 0) renderOrder.push("default")
      return h("span", null, `d:${val}`)
    }

    function TransitionComponent() {
      const [val, setVal] = useState(0)
      setTransition = setVal
      if (val > 0) renderOrder.push("transition")
      return h("span", null, `t:${val}`)
    }

    function App() {
      return h("div", null, h(DefaultComponent, null), h(TransitionComponent, null))
    }

    render(h(App, null), container)
    flushUpdates()

    // Schedule transition first, then default
    startTransition(() => {
      setTransition!(1)
    })
    setDefault!(1)

    flushUpdates()

    // Both should render, default first due to higher priority
    expect(renderOrder).toEqual(["default", "transition"])
  })
})

// ---------------------------------------------------------------------------
// useTransition
// ---------------------------------------------------------------------------

describe("useTransition", () => {
  it("returns [isPending, startTransition] tuple", () => {
    let result: readonly [boolean, (cb: () => void) => void] | null = null

    function App() {
      result = useTransition()
      return h("div", null, "test")
    }

    render(h(App, null), container)
    flushUpdates()

    expect(result).not.toBeNull()
    expect(typeof result![0]).toBe("boolean")
    expect(typeof result![1]).toBe("function")
  })

  it("isPending is false initially", () => {
    let isPending: boolean | null = null

    function App() {
      const [pending] = useTransition()
      isPending = pending
      return h("div", null, pending ? "pending" : "idle")
    }

    render(h(App, null), container)
    flushUpdates()

    expect(isPending).toBe(false)
    expect(container.textContent).toBe("idle")
  })

  it("transition callback triggers re-render", () => {
    let triggerTransition: ((cb: () => void) => void) | null = null
    let setCount: ((v: number) => void) | null = null

    function App() {
      const [count, sc] = useState(0)
      setCount = sc
      const [, st] = useTransition()
      triggerTransition = st
      return h("div", null, String(count))
    }

    render(h(App, null), container)
    flushUpdates()
    expect(container.textContent).toBe("0")

    triggerTransition!(() => {
      setCount!(99)
    })
    flushUpdates()

    expect(container.textContent).toBe("99")
  })

  it("isPending is true during Default-lane render, false after Transition-lane render", () => {
    const pendingValues: boolean[] = []
    let triggerTransition: ((cb: () => void) => void) | null = null
    let setData: ((v: string) => void) | null = null

    function App() {
      const [data, sd] = useState("initial")
      setData = sd
      const [isPending, st] = useTransition()
      triggerTransition = st
      pendingValues.push(isPending)
      return h("div", null, isPending ? "pending..." : data)
    }

    render(h(App, null), container)
    flushUpdates()
    expect(pendingValues).toEqual([false])
    expect(container.textContent).toBe("initial")

    // Trigger a transition
    triggerTransition!(() => {
      setData!("loaded")
    })

    // flushUpdates processes ALL lanes synchronously (test mode).
    // The component is queued in both Default (isPending=true) and
    // Transition (isPending=false + data="loaded") lanes.
    // Default lane renders first: isPending=true, data="initial"
    // Transition lane renders second: isPending=false, data="loaded"
    flushUpdates()

    // We should see both renders: pending=true then pending=false
    expect(pendingValues).toEqual([false, true, false])
    expect(container.textContent).toBe("loaded")
  })

  it("per-lane state: Default render sees isPending=true but not transition state", () => {
    const snapshots: Array<{ pending: boolean; data: string }> = []
    let triggerTransition: ((cb: () => void) => void) | null = null
    let setData: ((v: string) => void) | null = null

    function App() {
      const [data, sd] = useState("old")
      setData = sd
      const [isPending, st] = useTransition()
      triggerTransition = st

      snapshots.push({ pending: isPending, data })
      return h("div", null, `${isPending ? "P" : "-"}:${data}`)
    }

    render(h(App, null), container)
    flushUpdates()
    expect(snapshots).toEqual([{ pending: false, data: "old" }])

    triggerTransition!(() => {
      setData!("new")
    })
    flushUpdates()

    // The Default-lane render should see isPending=true but data="old"
    // (the data update is at Transition lane, not applied during Default render)
    // The Transition-lane render should see isPending=false and data="new"
    expect(snapshots).toEqual([
      { pending: false, data: "old" }, // initial mount
      { pending: true, data: "old" }, // Default-lane render
      { pending: false, data: "new" }, // Transition-lane render
    ])
  })
})

// ---------------------------------------------------------------------------
// useDeferredValue
// ---------------------------------------------------------------------------

describe("useDeferredValue", () => {
  it("returns the initial value on first render", () => {
    let deferred: number | null = null

    function App() {
      deferred = useDeferredValue(42)
      return h("div", null, String(deferred))
    }

    render(h(App, null), container)
    flushUpdates()

    expect(deferred).toBe(42)
    expect(container.textContent).toBe("42")
  })

  it("eventually catches up to a new value", () => {
    let setValue: ((v: number) => void) | null = null
    const deferredValues: number[] = []

    function App() {
      const [value, sv] = useState(0)
      setValue = sv
      const deferred = useDeferredValue(value)
      deferredValues.push(deferred)
      return h("div", null, `v:${value} d:${deferred}`)
    }

    render(h(App, null), container)
    flushUpdates()

    setValue!(10)
    // Flush all pending work (both Default and Transition lanes)
    flushUpdates()
    flushUpdates() // second flush to process any queued transition work

    // The deferred value should eventually match the current value
    expect(deferredValues[deferredValues.length - 1]).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// Mixed priority scenarios
// ---------------------------------------------------------------------------

describe("mixed priority scenarios", () => {
  it("Sync lane work is processed even when called from within Default lane work", () => {
    let setUrgent: ((v: number) => void) | null = null
    let setNormal: ((v: number) => void) | null = null

    function UrgentDisplay() {
      const [val, sv] = useState(0)
      setUrgent = sv
      return h("span", { id: "urgent" }, String(val))
    }

    function NormalDisplay() {
      const [val, sv] = useState(0)
      setNormal = sv
      return h("span", { id: "normal" }, String(val))
    }

    function App() {
      return h("div", null, h(UrgentDisplay, null), h(NormalDisplay, null))
    }

    render(h(App, null), container)
    flushUpdates()

    setUrgent!(1)
    setNormal!(1)
    flushUpdates()

    expect(container.querySelector("#urgent")!.textContent).toBe("1")
    expect(container.querySelector("#normal")!.textContent).toBe("1")
  })

  it("multiple startTransition calls batch correctly", () => {
    let setA: ((v: number) => void) | null = null
    let setB: ((v: number) => void) | null = null

    function App() {
      const [a, sa] = useState(0)
      const [b, sb] = useState(0)
      setA = sa
      setB = sb
      return h("div", null, `${a},${b}`)
    }

    render(h(App, null), container)
    flushUpdates()
    expect(container.textContent).toBe("0,0")

    startTransition(() => {
      setA!(1)
      setB!(2)
    })
    flushUpdates()

    expect(container.textContent).toBe("1,2")
  })
})
