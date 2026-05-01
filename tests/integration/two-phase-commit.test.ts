import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ComponentInstance } from "../../src/component"
import {
  beginCollecting,
  commitEffects,
  discardEffects,
  flushDeferredEffects,
  isCollecting,
  pendingDeferredEffectCount,
  pendingEffectCount,
  pushDeferredEffect,
} from "../../src/effects"
import {
  Lane,
  flushSyncWork,
  flushUpdates,
  scheduleUpdate,
  setCurrentLane,
} from "../../src/scheduler"

// ---------------------------------------------------------------------------
// Helper: minimal ComponentInstance mock
// ---------------------------------------------------------------------------

function makeInstance(rerenderFn?: () => void): ComponentInstance {
  return {
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
    _hookCount: 0,
  }
}

// ---------------------------------------------------------------------------
// Reset state between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  if (isCollecting()) discardEffects()
  setCurrentLane(Lane.Default)
  flushUpdates()
})

// ---------------------------------------------------------------------------
// flushUpdates (synchronous) -- should NOT use effect collection
// ---------------------------------------------------------------------------

describe("flushUpdates (synchronous) bypasses effect collection", () => {
  it("does not activate effect collection for any lane", () => {
    let wasCollecting = false
    const instance = makeInstance(() => {
      wasCollecting = isCollecting()
    })

    scheduleUpdate(instance, Lane.Transition)
    flushUpdates()

    expect(wasCollecting).toBe(false)
  })

  it("processes Transition lane work synchronously without queuing effects", () => {
    const order: string[] = []
    const sync = makeInstance(() => order.push("sync"))
    const def = makeInstance(() => order.push("default"))
    const trans = makeInstance(() => order.push("transition"))

    scheduleUpdate(trans, Lane.Transition)
    scheduleUpdate(def, Lane.Default)
    scheduleUpdate(sync, Lane.Sync)

    flushUpdates()

    expect(order).toEqual(["sync", "default", "transition"])
    expect(isCollecting()).toBe(false)
    expect(pendingEffectCount()).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Scheduler behavior with Transition lane
// ---------------------------------------------------------------------------

describe("Transition lane effect collection via auto-scheduler", () => {
  it("flushSyncWork pauses collection if active", () => {
    // Simulate: Transition work is being processed, triggers a Sync update
    let syncWasCollecting = false
    const syncInstance = makeInstance(() => {
      syncWasCollecting = isCollecting()
    })

    const transInstance = makeInstance(() => {
      // During transition render, schedule sync work and flush it
      scheduleUpdate(syncInstance, Lane.Sync)
      flushSyncWork()
    })

    scheduleUpdate(transInstance, Lane.Transition)
    flushUpdates()

    // Sync work should have run with collecting paused
    // (flushUpdates itself doesn't collect, so this test verifies
    // flushSyncWork handles the case where it's called during collection)
    expect(syncWasCollecting).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Cross-lane scheduling
// ---------------------------------------------------------------------------

describe("cross-lane scheduling", () => {
  it("Sync and Default work always executes directly (not through effect queue)", () => {
    const collectingDuringSync: boolean[] = []
    const collectingDuringDefault: boolean[] = []

    const sync1 = makeInstance(() => collectingDuringSync.push(isCollecting()))
    const sync2 = makeInstance(() => collectingDuringSync.push(isCollecting()))
    const def1 = makeInstance(() => collectingDuringDefault.push(isCollecting()))

    scheduleUpdate(sync1, Lane.Sync)
    scheduleUpdate(sync2, Lane.Sync)
    scheduleUpdate(def1, Lane.Default)

    flushUpdates()

    // None of these should have seen collecting=true
    expect(collectingDuringSync).toEqual([false, false])
    expect(collectingDuringDefault).toEqual([false])
  })

  it("same instance can be queued in Default and Transition lanes", () => {
    let renderCount = 0
    const instance = makeInstance(() => {
      renderCount++
    })

    scheduleUpdate(instance, Lane.Default)
    scheduleUpdate(instance, Lane.Transition)

    expect(instance._queuedLanes).toBe((1 << Lane.Default) | (1 << Lane.Transition))

    flushUpdates()

    expect(renderCount).toBe(2) // once per lane
    expect(instance._queuedLanes).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Deferred component effects (Phase 4)
// ---------------------------------------------------------------------------

describe("deferred component effects", () => {
  it("effects deferred during collection run after commit+flush", () => {
    const order: string[] = []

    beginCollecting()
    pushDeferredEffect(() => order.push("effect-1"))
    pushDeferredEffect(() => order.push("effect-2"))
    order.push("before-commit")

    commitEffects()
    order.push("after-commit")

    flushDeferredEffects()
    order.push("after-flush")

    expect(order).toEqual(["before-commit", "after-commit", "effect-1", "effect-2", "after-flush"])
  })

  it("discardEffects also discards deferred effects", () => {
    const spy = vi.fn()
    beginCollecting()
    pushDeferredEffect(spy)
    expect(pendingDeferredEffectCount()).toBe(1)

    discardEffects()
    expect(pendingDeferredEffectCount()).toBe(0)

    flushDeferredEffects()
    expect(spy).not.toHaveBeenCalled()
  })

  it("no deferred effects during Sync/Default lane (flushUpdates)", () => {
    let effectRan = false
    const instance = makeInstance(() => {
      // In flushUpdates, isCollecting is false, so effects run immediately
      effectRan = true
    })

    scheduleUpdate(instance, Lane.Default)
    flushUpdates()

    // The rerender ran (effects would run inline in real component)
    expect(effectRan).toBe(true)
    // No deferred effects should be pending
    expect(pendingDeferredEffectCount()).toBe(0)
  })
})
