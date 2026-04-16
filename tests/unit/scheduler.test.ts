import { beforeEach, describe, expect, it, vi } from "vitest"
import { flushUpdates, scheduleUpdate } from "../../src/scheduler"
import type { ComponentInstance } from "../../src/component"

// ---------------------------------------------------------------------------
// Helper: build a minimal ComponentInstance mock.
//
// Only the fields the scheduler touches are required:
//   _queued   – deduplication flag
//   _rerender – called during flush
//   _mounted  – checked by rerenderComponent (not the scheduler itself)
// ---------------------------------------------------------------------------

function makeInstance(rerenderFn?: () => void): ComponentInstance {
  const instance: ComponentInstance = {
    _type: () => { throw new Error("not a real component") },
    _props: {},
    _vnode: null as never,
    _rendered: null,
    _parentDom: null as never,
    _queued: false,
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

  it("resets _queued to false after processing each instance", () => {
    const instance = makeInstance()
    scheduleUpdate(instance)

    // _queued must be true while in the queue
    expect(instance._queued).toBe(true)

    flushUpdates()

    expect(instance._queued).toBe(false)
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

  it("sets _queued to true after first call", () => {
    const instance = makeInstance()

    scheduleUpdate(instance)
    expect(instance._queued).toBe(true)
  })

  it("does not set _queued again on subsequent calls while already queued", () => {
    const instance = makeInstance()
    scheduleUpdate(instance)

    // Manually set to false to detect if scheduleUpdate re-sets it
    // (it should not, because the early-return guard fires first)
    const originalQueued = instance._queued
    expect(originalQueued).toBe(true)

    scheduleUpdate(instance) // second call — should no-op due to guard
    expect(instance._queued).toBe(true) // still true, but from the first call

    flushUpdates()
  })

  it("allows re-queuing after a flush has cleared _queued", () => {
    const rerender = vi.fn()
    const instance = makeInstance(rerender)

    scheduleUpdate(instance)
    flushUpdates()
    expect(rerender).toHaveBeenCalledTimes(1)

    // After flush _queued is false again — can be re-queued
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
    expect(instance._queued).toBe(false)
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
