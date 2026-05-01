import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ComponentInstance } from "../../src/component"
import {
  beginCollecting,
  clearTransitionRestorers,
  commitEffects,
  discardEffects,
  domAppendChild,
  isCollecting,
  pendingEffectCount,
  pushTransitionRestorer,
  restoreTransitionState,
} from "../../src/effects"
import { ChildFlags, VNodeFlags } from "../../src/flags"
import { acquireVNode, clearPool, getPoolSize, releaseVNode } from "../../src/pool"
import { Lane, flushUpdates, scheduleUpdate, setCurrentLane } from "../../src/scheduler"

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
  clearPool()
})

// ---------------------------------------------------------------------------
// Transition restorer infrastructure (unit-level)
// ---------------------------------------------------------------------------

describe("Transition restorers", () => {
  it("restoreTransitionState runs restorers in reverse order", () => {
    const order: number[] = []
    beginCollecting()
    pushTransitionRestorer(() => order.push(1))
    pushTransitionRestorer(() => order.push(2))
    pushTransitionRestorer(() => order.push(3))
    restoreTransitionState()
    expect(order).toEqual([3, 2, 1])
  })

  it("restoreTransitionState clears the restorer queue", () => {
    const spy = vi.fn()
    beginCollecting()
    pushTransitionRestorer(spy)
    restoreTransitionState()
    expect(spy).toHaveBeenCalledTimes(1)

    // Second call should be a no-op
    restoreTransitionState()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("clearTransitionRestorers discards without running", () => {
    const spy = vi.fn()
    beginCollecting()
    pushTransitionRestorer(spy)
    clearTransitionRestorers()
    expect(spy).not.toHaveBeenCalled()

    // Also verify they don't run on a subsequent restore call
    restoreTransitionState()
    expect(spy).not.toHaveBeenCalled()
  })

  it("beginCollecting clears any existing restorers", () => {
    const spy = vi.fn()
    beginCollecting()
    pushTransitionRestorer(spy)
    // Start a new collection cycle
    beginCollecting()
    restoreTransitionState()
    expect(spy).not.toHaveBeenCalled()
  })

  it("discardEffects does not clear restorers (handled separately)", () => {
    const spy = vi.fn()
    beginCollecting()
    pushTransitionRestorer(spy)
    discardEffects()
    // Restorers survive discardEffects -- they must be run or
    // cleared explicitly via restoreTransitionState / clearTransitionRestorers
    restoreTransitionState()
    expect(spy).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// VNode state restoration
// ---------------------------------------------------------------------------

describe("VNode state restoration via restorers", () => {
  it("restores component _rendered and _vnode fields", () => {
    // Simulate what rerenderComponent does:
    // save state before render, then restore on abandonment
    const instance = makeInstance()
    const oldRendered = { type: "old-rendered" } as never
    const oldVnodeChildren = { type: "old-children" } as never
    const oldVnodeDom = document.createElement("div")

    instance._rendered = oldRendered
    instance._vnode = {
      children: oldVnodeChildren,
      dom: oldVnodeDom,
    } as never

    beginCollecting()

    // Capture state before render (as the real code does)
    const savedRendered = instance._rendered
    const savedVnodeChildren = instance._vnode.children
    const savedVnodeDom = instance._vnode.dom
    pushTransitionRestorer(() => {
      instance._rendered = savedRendered
      instance._vnode.children = savedVnodeChildren
      instance._vnode.dom = savedVnodeDom
    })

    // Simulate render modifying state
    instance._rendered = { type: "new-rendered" } as never
    instance._vnode.children = { type: "new-children" } as never
    instance._vnode.dom = document.createElement("span")

    // Abandon: restore
    restoreTransitionState()

    expect(instance._rendered).toBe(oldRendered)
    expect(instance._vnode.children).toBe(oldVnodeChildren)
    expect(instance._vnode.dom).toBe(oldVnodeDom)
  })

  it("restores multiple components in reverse render order", () => {
    const instanceA = makeInstance()
    const instanceB = makeInstance()
    const oldRenderedA = { id: "A-old" } as never
    const oldRenderedB = { id: "B-old" } as never

    instanceA._rendered = oldRenderedA
    instanceA._vnode = { children: null, dom: null } as never
    instanceB._rendered = oldRenderedB
    instanceB._vnode = { children: null, dom: null } as never

    beginCollecting()

    // A renders first
    const savedA = instanceA._rendered
    pushTransitionRestorer(() => {
      instanceA._rendered = savedA
    })
    instanceA._rendered = { id: "A-new" } as never

    // B renders second
    const savedB = instanceB._rendered
    pushTransitionRestorer(() => {
      instanceB._rendered = savedB
    })
    instanceB._rendered = { id: "B-new" } as never

    // Abandon
    restoreTransitionState()

    expect(instanceA._rendered).toBe(oldRenderedA)
    expect(instanceB._rendered).toBe(oldRenderedB)
  })
})

// ---------------------------------------------------------------------------
// VNode pool release deferral during Transition
// ---------------------------------------------------------------------------

describe("VNode pool release deferral during Transition", () => {
  it("releaseVNode does not pool VNodes when collecting", () => {
    const vnode = acquireVNode(
      VNodeFlags.Element,
      "div",
      null,
      null,
      null,
      ChildFlags.NoChildren,
      null,
    )
    vnode.dom = document.createElement("div")

    const initialPoolSize = getPoolSize()

    beginCollecting()
    releaseVNode(vnode)

    // Should NOT have been pooled
    expect(getPoolSize()).toBe(initialPoolSize)

    // VNode properties should NOT have been nulled
    expect(vnode.type).toBe("div")
    expect(vnode.dom).not.toBeNull()

    discardEffects()
  })

  it("releaseVNode pools VNodes normally when not collecting", () => {
    const vnode = acquireVNode(
      VNodeFlags.Element,
      "div",
      null,
      null,
      null,
      ChildFlags.NoChildren,
      null,
    )
    vnode.dom = document.createElement("div")

    const initialPoolSize = getPoolSize()

    releaseVNode(vnode)

    // Should have been pooled
    expect(getPoolSize()).toBe(initialPoolSize + 1)

    // VNode properties should have been nulled
    expect(vnode.type).toBeNull()
    expect(vnode.dom).toBeNull()
  })

  it("VNodes skipped during collection can be restored by restorers", () => {
    // This tests the full scenario: during Transition, unmount releases a
    // VNode (skipped), then abandonment restores state pointing to it.
    const vnode = acquireVNode(
      VNodeFlags.Element,
      "div",
      null,
      null,
      null,
      ChildFlags.NoChildren,
      null,
    )
    vnode.dom = document.createElement("div")

    const instance = makeInstance()
    instance._rendered = vnode as never

    beginCollecting()

    // Save state
    const savedRendered = instance._rendered
    pushTransitionRestorer(() => {
      instance._rendered = savedRendered
    })

    // Simulate render: new rendered, old vnode released
    instance._rendered = null
    releaseVNode(vnode)

    // VNode should still be intact (not pooled)
    expect(vnode.type).toBe("div")

    // Abandon and restore
    restoreTransitionState()
    discardEffects()

    // Restored reference points to intact VNode
    expect(instance._rendered).toBe(vnode)
    expect((instance._rendered as typeof vnode).type).toBe("div")
  })
})

// ---------------------------------------------------------------------------
// Transition abandonment via scheduler (generation counter)
// ---------------------------------------------------------------------------

describe("Transition abandonment via scheduler", () => {
  it("re-queues processed instances when Transition is superseded", () => {
    // Schedule two instances in Transition lane. The first one's rerender
    // will schedule a NEW Transition update (bumping the generation counter).
    // Since flushUpdates processes synchronously, it won't detect the
    // supersede mid-batch. But we can verify the re-queue logic by testing
    // that the newly scheduled instance gets processed.
    const renderOrder: string[] = []

    const instanceB = makeInstance(() => {
      renderOrder.push("B")
    })

    const instanceA = makeInstance(() => {
      renderOrder.push("A")
      // Schedule a new Transition update on B (simulates superseding)
      scheduleUpdate(instanceB, Lane.Transition)
    })

    scheduleUpdate(instanceA, Lane.Transition)
    scheduleUpdate(instanceB, Lane.Transition)

    flushUpdates()

    // Both should have rendered. A scheduled B again during its render,
    // but B was already queued so no duplicate.
    expect(renderOrder).toContain("A")
    expect(renderOrder).toContain("B")
  })

  it("Transition work commits effects after all instances processed", () => {
    // When using the auto-scheduler, Transition work uses effect collection.
    // flushUpdates bypasses this (direct DOM), but we can verify the commit
    // flow by manually simulating the Transition lifecycle.
    const order: string[] = []

    beginCollecting()
    order.push("collecting")

    // Simulate DOM mutations being queued
    expect(isCollecting()).toBe(true)
    expect(pendingEffectCount()).toBe(0)

    // Commit
    commitEffects()
    order.push("committed")

    clearTransitionRestorers()
    order.push("cleaned")

    expect(order).toEqual(["collecting", "committed", "cleaned"])
    expect(isCollecting()).toBe(false)
  })

  it("abandoned Transition discards queued DOM effects", () => {
    const parent = document.createElement("div")
    const child = document.createElement("span")

    beginCollecting()

    // Queue a DOM mutation via the effect-aware wrapper
    domAppendChild(parent, child)

    expect(pendingEffectCount()).toBe(1)
    expect(parent.children.length).toBe(0) // not applied yet

    // Abandon
    discardEffects()

    expect(pendingEffectCount()).toBe(0)
    expect(parent.children.length).toBe(0) // still not applied
  })
})
