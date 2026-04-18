import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  beginCollecting,
  commitEffects,
  discardEffects,
  domAppendChild,
  domSetTextContent,
  flushDeferredEffects,
  isCollecting,
  pendingDeferredEffectCount,
  pushDeferredEffect,
} from "../../src/effects"

// ---------------------------------------------------------------------------
// Reset state between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  if (isCollecting()) discardEffects()
})

// ---------------------------------------------------------------------------
// Deferred effects queue basics
// ---------------------------------------------------------------------------

describe("deferred effects queue", () => {
  it("pendingDeferredEffectCount is 0 initially", () => {
    expect(pendingDeferredEffectCount()).toBe(0)
  })

  it("pushDeferredEffect increments the count", () => {
    beginCollecting()
    pushDeferredEffect(() => {})
    pushDeferredEffect(() => {})
    expect(pendingDeferredEffectCount()).toBe(2)
  })

  it("flushDeferredEffects runs all queued callbacks in FIFO order", () => {
    const order: number[] = []
    beginCollecting()
    pushDeferredEffect(() => order.push(1))
    pushDeferredEffect(() => order.push(2))
    pushDeferredEffect(() => order.push(3))
    commitEffects()
    flushDeferredEffects()
    expect(order).toEqual([1, 2, 3])
    expect(pendingDeferredEffectCount()).toBe(0)
  })

  it("flushDeferredEffects clears the queue", () => {
    beginCollecting()
    pushDeferredEffect(() => {})
    commitEffects()
    flushDeferredEffects()
    expect(pendingDeferredEffectCount()).toBe(0)
  })

  it("discardEffects also clears deferred effects", () => {
    beginCollecting()
    pushDeferredEffect(() => {})
    pushDeferredEffect(() => {})
    expect(pendingDeferredEffectCount()).toBe(2)
    discardEffects()
    expect(pendingDeferredEffectCount()).toBe(0)
  })

  it("discarded deferred effects are not executed", () => {
    const spy = vi.fn()
    beginCollecting()
    pushDeferredEffect(spy)
    discardEffects()
    flushDeferredEffects() // should be a no-op
    expect(spy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Deferred effects see committed DOM state
// ---------------------------------------------------------------------------

describe("deferred effects see committed DOM", () => {
  it("effect callback sees DOM mutations from commitEffects", () => {
    const parent = document.createElement("div")
    const child = document.createElement("span")
    child.textContent = "hello"

    let sawChild = false

    beginCollecting()
    // Queue a structural DOM mutation (appendChild via effects wrapper)
    domAppendChild(parent, child)

    // Queue a deferred effect that reads the DOM
    pushDeferredEffect(() => {
      sawChild = parent.contains(child)
    })

    // Before commit: child is NOT in the DOM
    expect(parent.contains(child)).toBe(false)

    // Commit: applies appendChild
    commitEffects()

    // After commit but before flushing deferred effects: child IS in DOM
    expect(parent.contains(child)).toBe(true)

    // Flush deferred effects: callback should see the committed DOM
    flushDeferredEffects()
    expect(sawChild).toBe(true)
  })

  it("effect callback sees text content from committed thunk", () => {
    const el = document.createElement("div")
    el.textContent = "old"

    let observedText = ""

    beginCollecting()
    domSetTextContent(el, "new")

    pushDeferredEffect(() => {
      observedText = el.textContent ?? ""
    })

    // Before commit
    expect(el.textContent).toBe("old")

    commitEffects()
    flushDeferredEffects()

    // Effect saw the committed text
    expect(observedText).toBe("new")
  })
})
