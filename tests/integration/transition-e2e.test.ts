/**
 * End-to-end tests for Transition rendering through the auto-scheduler.
 *
 * Unlike the synchronous `flushUpdates()` tests in concurrent.test.ts,
 * these tests exercise the real MessageChannel-based auto-scheduler path
 * with two-phase commit (effect collection + atomic commit), paint-boundary
 * deferral, and time slicing.
 *
 * We use a `waitForStable` helper that repeatedly yields to the event loop
 * until no more DOM changes occur, simulating how the auto-scheduler
 * processes work across frames.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  h,
  render,
  useState,
  startTransition,
  useTransition,
  useDeferredValue,
  useEffect,
  useCallback,
  flushUpdates,
} from "../../src"
import { isCollecting, discardEffects } from "../../src/effects"
import { Lane, setCurrentLane } from "../../src/scheduler"

let container: HTMLDivElement

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  setCurrentLane(Lane.Default)
  if (isCollecting()) discardEffects()

  return () => {
    render(null, container)
    document.body.removeChild(container)
  }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Yield to the event loop, allowing MessageChannel callbacks, rAF callbacks,
 * and microtasks to fire. One call processes roughly one "frame" of work.
 */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20))
}

/**
 * Wait until the DOM stabilizes (no changes for two consecutive frames).
 * Max iterations prevents infinite loops in case of bugs.
 */
async function waitForStable(
  el: HTMLElement = container,
  maxIterations = 30,
): Promise<void> {
  let prevHTML = ""
  let stableCount = 0
  for (let i = 0; i < maxIterations; i++) {
    await nextFrame()
    const html = el.innerHTML
    if (html === prevHTML) {
      stableCount++
      if (stableCount >= 2) return
    } else {
      stableCount = 0
    }
    prevHTML = html
  }
}

// ---------------------------------------------------------------------------
// useTransition through auto-scheduler
// ---------------------------------------------------------------------------

describe("useTransition (auto-scheduler)", () => {
  it("isPending=true is visible before transition completes", async () => {
    const snapshots: Array<{ pending: boolean; data: string }> = []
    let triggerTransition: ((cb: () => void) => void) | null = null
    let setData: ((v: string) => void) | null = null

    function App() {
      const [data, sd] = useState("initial")
      setData = sd
      const [isPending, st] = useTransition()
      triggerTransition = st

      snapshots.push({ pending: isPending, data })
      return h("div", null, isPending ? "loading..." : data)
    }

    render(h(App, null), container)
    flushUpdates()
    expect(container.textContent).toBe("initial")
    expect(snapshots).toEqual([{ pending: false, data: "initial" }])

    // Trigger transition -- this schedules Default (isPending=true)
    // and Transition (isPending=false, data="loaded") lane work
    triggerTransition!(() => {
      setData!("loaded")
    })

    // Let the auto-scheduler process work
    await waitForStable()

    // Should have seen all three renders
    expect(snapshots.length).toBeGreaterThanOrEqual(3)

    // First render: initial
    expect(snapshots[0]).toEqual({ pending: false, data: "initial" })

    // Second render: isPending=true (Default lane)
    expect(snapshots[1]).toEqual({ pending: true, data: "initial" })

    // Final render: isPending=false, data=loaded (Transition lane)
    expect(snapshots[snapshots.length - 1]).toEqual({
      pending: false,
      data: "loaded",
    })

    expect(container.textContent).toBe("loaded")
  })

  it("transition updates are batched atomically", async () => {
    let triggerTransition: ((cb: () => void) => void) | null = null
    let setA: ((v: string) => void) | null = null
    let setB: ((v: string) => void) | null = null
    const domSnapshots: string[] = []

    function App() {
      const [a, sa] = useState("a0")
      const [b, sb] = useState("b0")
      setA = sa
      setB = sb
      const [, st] = useTransition()
      triggerTransition = st

      return h("div", null, h("span", { id: "a" }, a), h("span", { id: "b" }, b))
    }

    render(h(App, null), container)
    flushUpdates()
    expect(container.textContent).toBe("a0b0")

    // Observe DOM after each frame to check atomicity
    const observer = new MutationObserver(() => {
      const aEl = container.querySelector("#a")
      const bEl = container.querySelector("#b")
      if (aEl && bEl) {
        domSnapshots.push(`${aEl.textContent},${bEl.textContent}`)
      }
    })
    observer.observe(container, { subtree: true, characterData: true, childList: true })

    triggerTransition!(() => {
      setA!("a1")
      setB!("b1")
    })

    await waitForStable()
    observer.disconnect()

    // Final state should be both updated
    expect(container.querySelector("#a")!.textContent).toBe("a1")
    expect(container.querySelector("#b")!.textContent).toBe("b1")

    // The transition updates should appear together (atomic commit).
    // We should never see a1,b0 or a0,b1 in the DOM snapshots.
    for (const snap of domSnapshots) {
      expect(snap === "a0,b0" || snap === "a1,b1").toBe(true)
    }
  })

  it("multiple transitions: latest wins", async () => {
    let triggerTransition: ((cb: () => void) => void) | null = null
    let setData: ((v: string) => void) | null = null

    function App() {
      const [data, sd] = useState("initial")
      setData = sd
      const [isPending, st] = useTransition()
      triggerTransition = st
      return h("div", null, isPending ? `loading(${data})` : data)
    }

    render(h(App, null), container)
    flushUpdates()
    expect(container.textContent).toBe("initial")

    // Fire two transitions rapidly -- second should supersede first
    triggerTransition!(() => {
      setData!("first")
    })

    triggerTransition!(() => {
      setData!("second")
    })

    await waitForStable()

    // Final state should reflect the latest transition
    expect(container.textContent).toBe("second")
  })
})

// ---------------------------------------------------------------------------
// startTransition through auto-scheduler
// ---------------------------------------------------------------------------

describe("startTransition (auto-scheduler)", () => {
  it("Transition state updates render after Default updates", async () => {
    const renderOrder: string[] = []
    let setDefault: ((v: number) => void) | null = null
    let setTransition: ((v: number) => void) | null = null

    function DefaultComponent() {
      const [val, sv] = useState(0)
      setDefault = sv
      if (val > 0) renderOrder.push("default")
      return h("span", null, `d:${val}`)
    }

    function TransitionComponent() {
      const [val, sv] = useState(0)
      setTransition = sv
      if (val > 0) renderOrder.push("transition")
      return h("span", null, `t:${val}`)
    }

    function App() {
      return h("div", null, h(DefaultComponent, null), h(TransitionComponent, null))
    }

    render(h(App, null), container)
    flushUpdates()

    // Schedule transition first, then default -- default should still render first
    startTransition(() => {
      setTransition!(1)
    })
    setDefault!(1)

    await waitForStable()

    expect(renderOrder[0]).toBe("default")
    expect(renderOrder).toContain("transition")
    expect(container.textContent).toBe("d:1t:1")
  })

  it("DOM mutations during Transition are not visible until commit", async () => {
    let setItems: ((v: string[]) => void) | null = null
    const domObservations: number[] = []

    function List() {
      const [items, si] = useState<string[]>([])
      setItems = si
      return h(
        "ul",
        null,
        ...items.map((item) => h("li", { key: item }, item)),
      )
    }

    render(h(List, null), container)
    flushUpdates()
    expect(container.querySelector("ul")!.children.length).toBe(0)

    // Set up a MutationObserver to count <li> elements after each mutation batch
    const ul = container.querySelector("ul")!
    const observer = new MutationObserver(() => {
      domObservations.push(ul.children.length)
    })
    observer.observe(ul, { childList: true })

    startTransition(() => {
      setItems!(["a", "b", "c"])
    })

    await waitForStable()
    observer.disconnect()

    // All three items should appear at once (atomic commit)
    expect(ul.children.length).toBe(3)

    // The DOM observations should show 0 -> 3 (not 0 -> 1 -> 2 -> 3)
    // because the effect queue commits all mutations atomically
    if (domObservations.length > 0) {
      // The last observation should be 3
      expect(domObservations[domObservations.length - 1]).toBe(3)
      // There should be no intermediate states (1 or 2)
      for (const count of domObservations) {
        expect(count === 0 || count === 3).toBe(true)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// useDeferredValue through auto-scheduler
// ---------------------------------------------------------------------------

describe("useDeferredValue (auto-scheduler)", () => {
  it("returns stale value on urgent render, catches up via Transition", async () => {
    let setValue: ((v: number) => void) | null = null
    const deferredSnapshots: number[] = []

    function App() {
      const [value, sv] = useState(0)
      setValue = sv
      const deferred = useDeferredValue(value)
      deferredSnapshots.push(deferred)
      return h("div", null, `v:${value} d:${deferred}`)
    }

    render(h(App, null), container)
    flushUpdates()
    expect(container.textContent).toBe("v:0 d:0")

    setValue!(42)
    await waitForStable()

    // Deferred value should eventually catch up
    expect(deferredSnapshots[deferredSnapshots.length - 1]).toBe(42)
    expect(container.textContent).toBe("v:42 d:42")

    // The intermediate render should have shown the stale deferred value:
    // First: v:0 d:0 (initial)
    // Second: v:42 d:0 (urgent render, deferred still stale)
    // Third: v:42 d:42 (transition render, deferred caught up)
    expect(deferredSnapshots.length).toBeGreaterThanOrEqual(2)
    // First non-initial deferred value should still be 0 (stale)
    if (deferredSnapshots.length >= 3) {
      expect(deferredSnapshots[1]).toBe(0)
    }
  })

  it("rapid value changes eventually settle to latest", async () => {
    let setValue: ((v: number) => void) | null = null

    function App() {
      const [value, sv] = useState(0)
      setValue = sv
      const deferred = useDeferredValue(value)
      return h("div", null, `v:${value} d:${deferred}`)
    }

    render(h(App, null), container)
    flushUpdates()

    // Rapid updates
    setValue!(1)
    await nextFrame()
    setValue!(2)
    await nextFrame()
    setValue!(3)

    await waitForStable()

    // Final state should be fully converged
    expect(container.textContent).toBe("v:3 d:3")
  })
})

// ---------------------------------------------------------------------------
// Mixed: useTransition + child components
// ---------------------------------------------------------------------------

describe("useTransition with child component tree", () => {
  it("child components see transition state correctly", async () => {
    let triggerTransition: ((cb: () => void) => void) | null = null
    let setItems: ((v: string[]) => void) | null = null

    function Item({ label }: { label: string }) {
      return h("li", null, label)
    }

    function ItemList() {
      const [items, si] = useState<string[]>(["a"])
      setItems = si
      return h(
        "ul",
        null,
        ...items.map((item) => h(Item, { key: item, label: item })),
      )
    }

    function App() {
      const [isPending, st] = useTransition()
      triggerTransition = st
      return h(
        "div",
        null,
        h("p", null, isPending ? "updating..." : "ready"),
        h(ItemList, null),
      )
    }

    render(h(App, null), container)
    flushUpdates()
    expect(container.querySelector("p")!.textContent).toBe("ready")
    expect(container.querySelectorAll("li").length).toBe(1)

    triggerTransition!(() => {
      setItems!(["a", "b", "c"])
    })

    await waitForStable()

    expect(container.querySelector("p")!.textContent).toBe("ready")
    expect(container.querySelectorAll("li").length).toBe(3)
    expect(container.querySelectorAll("li")[0]!.textContent).toBe("a")
    expect(container.querySelectorAll("li")[1]!.textContent).toBe("b")
    expect(container.querySelectorAll("li")[2]!.textContent).toBe("c")
  })

  it("effect callbacks fire after transition commit", async () => {
    const effectLog: string[] = []
    let triggerTransition: ((cb: () => void) => void) | null = null
    let setData: ((v: string) => void) | null = null

    function Child({ data }: { data: string }) {
      useEffect(() => {
        effectLog.push(`effect:${data}`)
        return () => {
          effectLog.push(`cleanup:${data}`)
        }
      }, [data])
      return h("span", null, data)
    }

    function App() {
      const [data, sd] = useState("initial")
      setData = sd
      const [, st] = useTransition()
      triggerTransition = st
      return h("div", null, h(Child, { data }))
    }

    render(h(App, null), container)
    flushUpdates()
    // Initial effect should have fired
    expect(effectLog).toContain("effect:initial")

    effectLog.length = 0

    triggerTransition!(() => {
      setData!("updated")
    })

    await waitForStable()

    // Effect for the new value should have fired
    expect(effectLog).toContain("cleanup:initial")
    expect(effectLog).toContain("effect:updated")
    expect(container.textContent).toBe("updated")
  })
})
