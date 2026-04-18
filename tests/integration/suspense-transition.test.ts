/**
 * Tests for Suspense + Transition integration.
 *
 * When a component suspends during a Transition-lane render, the old
 * committed UI should remain visible (no fallback). The Transition is
 * abandoned and retried when the suspended data resolves.
 *
 * During Sync/Default lane renders, Suspense works normally -- the
 * fallback is shown immediately.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  h,
  render,
  useState,
  startTransition,
  useTransition,
  flushUpdates,
  Suspense,
  lazy,
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

function nextFrame(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20))
}

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

/**
 * Create a suspending component that throws a promise until resolved.
 * Returns [Component, resolve] where resolve() causes the component
 * to stop suspending and render its content.
 */
function createSuspendingComponent(content: string) {
  let resolve!: () => void
  let resolved = false
  const promise = new Promise<void>((r) => {
    resolve = () => {
      resolved = true
      r()
    }
  })

  function SuspendingChild() {
    if (!resolved) throw promise
    return h("span", null, content)
  }

  return { SuspendingChild, resolve }
}

// ---------------------------------------------------------------------------
// Suspense in Sync/Default lane (existing behavior -- fallback shows)
// ---------------------------------------------------------------------------

describe("Suspense in Sync/Default lane", () => {
  it("shows fallback when child suspends during Default-lane render", () => {
    const { SuspendingChild, resolve } = createSuspendingComponent("loaded")

    function App() {
      return h(
        Suspense,
        { fallback: h("div", null, "loading...") },
        h(SuspendingChild, null),
      )
    }

    render(h(App, null), container)
    flushUpdates()

    // Fallback should be visible
    expect(container.textContent).toBe("loading...")

    // Resolve the suspension
    resolve()

    // After resolution and re-render, content should be visible
    return waitForStable().then(() => {
      flushUpdates()
      expect(container.textContent).toBe("loaded")
    })
  })
})

// ---------------------------------------------------------------------------
// Suspense in Transition lane (new behavior -- old UI stays visible)
// ---------------------------------------------------------------------------

describe("Suspense in Transition lane", () => {
  it("keeps old UI visible when child suspends during Transition", async () => {
    const { SuspendingChild, resolve } = createSuspendingComponent("new-data")
    let triggerTransition: ((cb: () => void) => void) | null = null
    let setShowSuspending: ((v: boolean) => void) | null = null

    function App() {
      const [showSuspending, ss] = useState(false)
      setShowSuspending = ss
      const [isPending, st] = useTransition()
      triggerTransition = st

      return h(
        "div",
        null,
        h("p", { id: "status" }, isPending ? "pending" : "ready"),
        h(
          Suspense,
          { fallback: h("div", null, "loading...") },
          showSuspending
            ? h(SuspendingChild, null)
            : h("span", null, "initial"),
        ),
      )
    }

    render(h(App, null), container)
    flushUpdates()
    expect(container.textContent).toBe("readyinitial")

    // Trigger a Transition that will cause Suspense
    triggerTransition!(() => {
      setShowSuspending!(true)
    })

    await waitForStable()

    // The old UI should still be visible -- NOT the fallback
    // The "loading..." fallback should NOT appear during Transition
    expect(container.textContent).not.toContain("loading...")
    expect(container.textContent).toContain("initial")

    // Resolve the suspension
    resolve()

    await waitForStable()

    // Now the new content should be visible
    expect(container.textContent).toContain("new-data")
    expect(container.querySelector("#status")!.textContent).toBe("ready")
  })

  it("shows fallback during initial mount even in Transition context", () => {
    // During initial mount, there's no "old UI" to keep visible,
    // so the fallback should show regardless of lane.
    const { SuspendingChild, resolve } = createSuspendingComponent("loaded")

    function App() {
      return h(
        Suspense,
        { fallback: h("div", null, "loading...") },
        h(SuspendingChild, null),
      )
    }

    // Mount inside a startTransition
    startTransition(() => {
      render(h(App, null), container)
    })
    flushUpdates()

    // Initial mount always shows fallback
    expect(container.textContent).toBe("loading...")

    resolve()
    return waitForStable().then(() => {
      flushUpdates()
      expect(container.textContent).toBe("loaded")
    })
  })

  it("retries Transition render after suspended data resolves", async () => {
    let dataResolve!: () => void
    let dataResolved = false
    const dataPromise = new Promise<void>((r) => {
      dataResolve = () => {
        dataResolved = true
        r()
      }
    })

    function DataComponent() {
      if (!dataResolved) throw dataPromise
      return h("span", null, "data-loaded")
    }

    let triggerTransition: ((cb: () => void) => void) | null = null
    let setShowData: ((v: boolean) => void) | null = null

    function App() {
      const [showData, sd] = useState(false)
      setShowData = sd
      const [, st] = useTransition()
      triggerTransition = st

      return h(
        Suspense,
        { fallback: h("div", null, "fallback") },
        showData ? h(DataComponent, null) : h("div", null, "placeholder"),
      )
    }

    render(h(App, null), container)
    flushUpdates()
    expect(container.textContent).toBe("placeholder")

    // Trigger Transition that suspends
    triggerTransition!(() => {
      setShowData!(true)
    })

    await waitForStable()

    // Old UI should still be visible
    expect(container.textContent).toBe("placeholder")

    // Resolve the data
    dataResolve()

    // The Transition should retry and succeed
    await waitForStable()

    expect(container.textContent).toBe("data-loaded")
  })

  it("isPending stays true while Transition is suspended", async () => {
    let dataResolve!: () => void
    let dataResolved = false
    const dataPromise = new Promise<void>((r) => {
      dataResolve = () => {
        dataResolved = true
        r()
      }
    })

    function DataComponent() {
      if (!dataResolved) throw dataPromise
      return h("span", null, "ready-data")
    }

    let triggerTransition: ((cb: () => void) => void) | null = null
    let setShowData: ((v: boolean) => void) | null = null
    const pendingStates: boolean[] = []

    function App() {
      const [showData, sd] = useState(false)
      setShowData = sd
      const [isPending, st] = useTransition()
      triggerTransition = st
      pendingStates.push(isPending)

      return h(
        "div",
        null,
        h("p", null, isPending ? "updating..." : "idle"),
        h(
          Suspense,
          { fallback: h("div", null, "fallback") },
          showData ? h(DataComponent, null) : h("span", null, "old"),
        ),
      )
    }

    render(h(App, null), container)
    flushUpdates()
    expect(container.textContent).toBe("idleold")

    triggerTransition!(() => {
      setShowData!(true)
    })

    await waitForStable()

    // isPending should be true since Transition hasn't completed
    expect(container.textContent).toContain("updating...")
    expect(container.textContent).toContain("old") // old UI visible

    // Resolve the data
    dataResolve()
    await waitForStable()

    // isPending should be false and new data visible
    expect(container.textContent).toBe("idleready-data")
  })
})
