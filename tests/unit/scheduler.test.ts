import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ComponentInstance } from "../../src/component"
import {
  Lane,
  flushSyncWork,
  flushUpdates,
  getCurrentLane,
  scheduleUpdate,
  setCurrentLane,
  shouldYield,
} from "../../src/scheduler"

// ---------------------------------------------------------------------------
// Helper: build a minimal ComponentInstance mock.
//
// Only the fields the scheduler touches are required:
//   _queuedLanes – per-lane deduplication bitmask
//   _rerender    – called during flush
//   _mounted     – checked by rerenderComponent (not the scheduler itself)
// ---------------------------------------------------------------------------

function makeInstance(rerenderFn?: () => void): ComponentInstance {
  const instance: ComponentInstance = {
    _type: () => {
      throw new Error("not a real component")
    },
    _props: {},
    _vnode: null as never,
    _rendered: null,
    _parentDom: null as never,
    _queuedLanes: 0,
    _hooks: [],
    _effects: [],
    _mounted: true,
    _rerender: rerenderFn ?? vi.fn(),
    _contexts: null,
  }
  return instance
}

// ---------------------------------------------------------------------------
// Reset module-level scheduler state between tests.
//
// The scheduler's updateQueue, isFlushing, and isFlushScheduled variables are
// module-level and persist across tests unless we drain them.  Calling
// flushUpdates() at the start of each test (before re-queuing anything) gives
// us a clean slate.
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Drain any leftover queue from a previous test.
  flushUpdates()
})

// ---------------------------------------------------------------------------
// flushUpdates
// ---------------------------------------------------------------------------

describe("flushUpdates()", () => {
  it("calls _rerender for each queued component", () => {
    const rerenderA = vi.fn()
    const rerenderB = vi.fn()
    const a = makeInstance(rerenderA)
    const b = makeInstance(rerenderB)

    scheduleUpdate(a)
    scheduleUpdate(b)

    flushUpdates()

    expect(rerenderA).toHaveBeenCalledTimes(1)
    expect(rerenderB).toHaveBeenCalledTimes(1)
  })

  it("resets _queuedLanes to 0 after processing each instance", () => {
    const instance = makeInstance()
    scheduleUpdate(instance)

    // _queuedLanes must be non-zero while in the queue
    expect(instance._queuedLanes).not.toBe(0)

    flushUpdates()

    expect(instance._queuedLanes).toBe(0)
  })

  it("processes an empty queue without errors", () => {
    expect(() => flushUpdates()).not.toThrow()
  })

  it("does not call _rerender when queue is empty", () => {
    const rerender = vi.fn()
    const instance = makeInstance(rerender)

    // Do NOT schedule the instance
    flushUpdates()

    expect(rerender).not.toHaveBeenCalled()
  })

  it("processes updates scheduled during flush (second iteration of while loop)", () => {
    const secondRerender = vi.fn()
    const second = makeInstance(secondRerender)

    const firstRerender = vi.fn(() => {
      // Schedule another component from inside _rerender
      scheduleUpdate(second)
    })
    const first = makeInstance(firstRerender)

    scheduleUpdate(first)
    flushUpdates()

    // Both components must have been processed
    expect(firstRerender).toHaveBeenCalledTimes(1)
    expect(secondRerender).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// scheduleUpdate – deduplication
// ---------------------------------------------------------------------------

describe("scheduleUpdate() deduplication", () => {
  it("queues the same component only once", () => {
    const rerender = vi.fn()
    const instance = makeInstance(rerender)

    scheduleUpdate(instance)
    scheduleUpdate(instance)
    scheduleUpdate(instance)

    flushUpdates()

    expect(rerender).toHaveBeenCalledTimes(1)
  })

  it("sets _queuedLanes bit after first call", () => {
    const instance = makeInstance()

    scheduleUpdate(instance)
    expect(instance._queuedLanes).not.toBe(0)
  })

  it("does not double-queue in the same lane", () => {
    const instance = makeInstance()
    scheduleUpdate(instance)

    const original = instance._queuedLanes
    expect(original).not.toBe(0)

    scheduleUpdate(instance) // second call — should no-op for same lane
    expect(instance._queuedLanes).toBe(original)

    flushUpdates()
  })

  it("allows re-queuing after a flush has cleared _queuedLanes", () => {
    const rerender = vi.fn()
    const instance = makeInstance(rerender)

    scheduleUpdate(instance)
    flushUpdates()
    expect(rerender).toHaveBeenCalledTimes(1)

    // After flush _queuedLanes is 0 — can be re-queued
    scheduleUpdate(instance)
    flushUpdates()
    expect(rerender).toHaveBeenCalledTimes(2)
  })
})

// ---------------------------------------------------------------------------
// flushUpdates – reentrant-safety
// ---------------------------------------------------------------------------

describe("flushUpdates() reentrant-safety", () => {
  it("does not re-enter when called from within a flush", () => {
    const innerFlushRerender = vi.fn()
    const outer = makeInstance(() => {
      // Calling flushUpdates() from inside a _rerender should be a no-op
      // (the isFlushing guard prevents re-entry).
      flushUpdates()
    })
    const inner = makeInstance(innerFlushRerender)

    scheduleUpdate(outer)
    // Also queue inner — it will be processed by the outer flush's while loop,
    // not by the nested flushUpdates() call (which should be a no-op).
    scheduleUpdate(inner)

    flushUpdates()

    // inner._rerender must still be called exactly once (via the outer flush)
    expect(innerFlushRerender).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// scheduleUpdate – synchronous flush before microtask fires
// ---------------------------------------------------------------------------

describe("manual synchronous flush", () => {
  it("processes updates synchronously before any microtask fires", () => {
    const rerender = vi.fn()
    const instance = makeInstance(rerender)

    scheduleUpdate(instance)

    // At this point the microtask is scheduled but has not fired.
    // Calling flushUpdates() synchronously should process the queue immediately.
    flushUpdates()

    expect(rerender).toHaveBeenCalledTimes(1)
    expect(instance._queuedLanes).toBe(0)
  })

  it("the microtask that fires after a synchronous flush finds an empty queue", async () => {
    const rerender = vi.fn()
    const instance = makeInstance(rerender)

    scheduleUpdate(instance)
    // Flush synchronously
    flushUpdates()

    // Let the microtask scheduled by scheduleUpdate fire
    await Promise.resolve()

    // _rerender must still have been called exactly once — the microtask
    // invokes flushUpdates() which finds an empty queue and exits immediately.
    expect(rerender).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Lane-based scheduling
// ---------------------------------------------------------------------------

describe("Lane constants", () => {
  it("exports Sync, Default, Transition lanes in priority order", () => {
    expect(Lane.Sync).toBe(0)
    expect(Lane.Default).toBe(1)
    expect(Lane.Transition).toBe(2)
    expect(Lane.Sync).toBeLessThan(Lane.Default)
    expect(Lane.Default).toBeLessThan(Lane.Transition)
  })
})

describe("scheduleUpdate() with explicit lanes", () => {
  it("schedules work to the Sync lane", () => {
    const rerender = vi.fn()
    const instance = makeInstance(rerender)

    scheduleUpdate(instance, Lane.Sync)
    flushUpdates()

    expect(rerender).toHaveBeenCalledTimes(1)
  })

  it("schedules work to the Transition lane", () => {
    const rerender = vi.fn()
    const instance = makeInstance(rerender)

    scheduleUpdate(instance, Lane.Transition)
    flushUpdates()

    expect(rerender).toHaveBeenCalledTimes(1)
  })

  it("defaults to currentLane when no lane is specified", () => {
    const rerender = vi.fn()
    const instance = makeInstance(rerender)

    // Default currentLane is Lane.Sync (concurrent work is opt-in via startTransition)
    expect(getCurrentLane()).toBe(Lane.Sync)

    scheduleUpdate(instance)
    flushUpdates()

    expect(rerender).toHaveBeenCalledTimes(1)
  })
})

describe("setCurrentLane / getCurrentLane", () => {
  beforeEach(() => {
    // Reset to default lane
    setCurrentLane(Lane.Default)
  })

  it("returns the default lane initially", () => {
    expect(getCurrentLane()).toBe(Lane.Default)
  })

  it("changes the current lane context", () => {
    setCurrentLane(Lane.Transition)
    expect(getCurrentLane()).toBe(Lane.Transition)

    setCurrentLane(Lane.Sync)
    expect(getCurrentLane()).toBe(Lane.Sync)
  })

  it("scheduleUpdate uses the current lane when none is specified", () => {
    setCurrentLane(Lane.Transition)

    const rerender = vi.fn()
    const instance = makeInstance(rerender)

    scheduleUpdate(instance)
    flushUpdates()

    expect(rerender).toHaveBeenCalledTimes(1)

    // Restore
    setCurrentLane(Lane.Default)
  })
})

describe("Lane priority ordering", () => {
  it("processes Sync lane before Default lane", () => {
    const order: string[] = []
    const syncInstance = makeInstance(() => order.push("sync"))
    const defaultInstance = makeInstance(() => order.push("default"))

    // Schedule Default first, then Sync
    scheduleUpdate(defaultInstance, Lane.Default)
    scheduleUpdate(syncInstance, Lane.Sync)

    flushUpdates()

    expect(order).toEqual(["sync", "default"])
  })

  it("processes Default lane before Transition lane", () => {
    const order: string[] = []
    const transitionInstance = makeInstance(() => order.push("transition"))
    const defaultInstance = makeInstance(() => order.push("default"))

    // Schedule Transition first, then Default
    scheduleUpdate(transitionInstance, Lane.Transition)
    scheduleUpdate(defaultInstance, Lane.Default)

    flushUpdates()

    expect(order).toEqual(["default", "transition"])
  })

  it("processes all three lanes in priority order", () => {
    const order: string[] = []
    const syncInstance = makeInstance(() => order.push("sync"))
    const defaultInstance = makeInstance(() => order.push("default"))
    const transitionInstance = makeInstance(() => order.push("transition"))

    // Schedule in reverse priority order
    scheduleUpdate(transitionInstance, Lane.Transition)
    scheduleUpdate(defaultInstance, Lane.Default)
    scheduleUpdate(syncInstance, Lane.Sync)

    flushUpdates()

    expect(order).toEqual(["sync", "default", "transition"])
  })

  it("processes multiple items within the same lane in order", () => {
    const order: number[] = []
    const a = makeInstance(() => order.push(1))
    const b = makeInstance(() => order.push(2))
    const c = makeInstance(() => order.push(3))

    scheduleUpdate(a, Lane.Default)
    scheduleUpdate(b, Lane.Default)
    scheduleUpdate(c, Lane.Default)

    flushUpdates()

    expect(order).toEqual([1, 2, 3])
  })
})

describe("flushSyncWork()", () => {
  it("flushes only Sync lane work", () => {
    const syncRerender = vi.fn()
    const defaultRerender = vi.fn()
    const syncInstance = makeInstance(syncRerender)
    const defaultInstance = makeInstance(defaultRerender)

    scheduleUpdate(syncInstance, Lane.Sync)
    scheduleUpdate(defaultInstance, Lane.Default)

    flushSyncWork()

    expect(syncRerender).toHaveBeenCalledTimes(1)
    expect(defaultRerender).not.toHaveBeenCalled()

    // Now flush the rest
    flushUpdates()
    expect(defaultRerender).toHaveBeenCalledTimes(1)
  })

  it("does nothing when Sync lane is empty", () => {
    const defaultRerender = vi.fn()
    const instance = makeInstance(defaultRerender)

    scheduleUpdate(instance, Lane.Default)
    flushSyncWork()

    // Default lane should NOT have been flushed
    expect(defaultRerender).not.toHaveBeenCalled()

    flushUpdates()
    expect(defaultRerender).toHaveBeenCalledTimes(1)
  })
})

describe("shouldYield()", () => {
  it("never yields for Sync lane work (tested indirectly)", () => {
    // shouldYield returns false when activeLane is Sync
    // We test indirectly: schedule many Sync items and verify they all flush
    const count = 100
    let processed = 0
    const instances: ComponentInstance[] = []

    for (let i = 0; i < count; i++) {
      instances.push(
        makeInstance(() => {
          processed++
        }),
      )
    }

    for (const inst of instances) {
      scheduleUpdate(inst, Lane.Sync)
    }

    flushUpdates()

    expect(processed).toBe(count)
  })
})

describe("per-lane queuing", () => {
  it("allows the same instance to be queued in multiple lanes", () => {
    let renderCount = 0
    const instance = makeInstance(() => {
      renderCount++
    })

    scheduleUpdate(instance, Lane.Default)
    scheduleUpdate(instance, Lane.Transition)

    // Should be queued in both lanes (bits 1 and 2)
    expect(instance._queuedLanes).toBe((1 << Lane.Default) | (1 << Lane.Transition))

    flushUpdates()

    // Should have been rendered once per lane
    expect(renderCount).toBe(2)
    expect(instance._queuedLanes).toBe(0)
  })

  it("deduplicates within the same lane but not across lanes", () => {
    let renderCount = 0
    const instance = makeInstance(() => {
      renderCount++
    })

    scheduleUpdate(instance, Lane.Default)
    scheduleUpdate(instance, Lane.Default) // duplicate - should be ignored
    scheduleUpdate(instance, Lane.Transition)
    scheduleUpdate(instance, Lane.Transition) // duplicate - should be ignored

    flushUpdates()

    expect(renderCount).toBe(2) // one per lane, not four
  })
})
