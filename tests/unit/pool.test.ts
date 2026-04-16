import { beforeEach, describe, expect, it } from "vitest"
import { clearPool, getPoolSize, h, mount, unmount } from "../../src/index"
import type { VNode } from "../../src/vnode"

describe("VNode object pooling", () => {
  let container: HTMLDivElement

  beforeEach(() => {
    clearPool()
    container = document.createElement("div")
  })

  it("should start with an empty pool", () => {
    expect(getPoolSize()).toBe(0)
  })

  it("should return VNodes to the pool on unmount", () => {
    const vnode = h("div", null, "hello")
    mount(vnode, container)
    expect(getPoolSize()).toBe(0)

    unmount(vnode, container)
    // The div VNode + its text child VNode should be pooled
    expect(getPoolSize()).toBeGreaterThan(0)
  })

  it("should reuse pooled VNodes for new creations", () => {
    // Mount and unmount to populate the pool
    const vnode1 = h("span", null, "first")
    mount(vnode1, container)
    unmount(vnode1, container)

    const poolSizeBefore = getPoolSize()
    expect(poolSizeBefore).toBeGreaterThan(0)

    // Creating new VNodes should pull from pool
    const _vnode2 = h("div", null, "second")
    expect(getPoolSize()).toBeLessThan(poolSizeBefore)
  })

  it("should not grow pool beyond MAX_POOL_SIZE", () => {
    // Create and unmount many VNodes
    for (let i = 0; i < 10100; i++) {
      const vnode = h("div", null)
      mount(vnode, container)
      unmount(vnode, container)
    }
    // Pool should be capped at 10000
    expect(getPoolSize()).toBeLessThanOrEqual(10000)
  })

  it("should reset all VNode properties when releasing", () => {
    const vnode = h("div", { className: "test" }, "child")
    mount(vnode, container)
    unmount(vnode, container)

    // Pool should have released VNodes with all props reset
    expect(getPoolSize()).toBeGreaterThan(0)
    // Create a new VNode from pool and verify it has clean state
    const reused = h("span", null)
    expect(reused.type).toBe("span")
    expect(reused.key).toBeNull()
    expect(reused.dom).toBeNull()
    expect(reused.parentDom).toBeNull()
  })

  it("should pool VNodes from nested trees", () => {
    const vnode = h("div", null, h("ul", null, h("li", null, "item 1"), h("li", null, "item 2")))
    mount(vnode, container)
    unmount(vnode, container)

    // Should have pooled: div, ul, 2x li, 2x text = 6 VNodes
    expect(getPoolSize()).toBeGreaterThanOrEqual(4)
  })

  it("should clear the pool", () => {
    const vnode = h("div", null, "text")
    mount(vnode, container)
    unmount(vnode, container)
    expect(getPoolSize()).toBeGreaterThan(0)

    clearPool()
    expect(getPoolSize()).toBe(0)
  })

  it("should return component VNodes to the pool on unmount", () => {
    function MyComp() {
      return h("span", null, "hello")
    }

    const vnode = h(MyComp, null)
    mount(vnode, container)
    expect(getPoolSize()).toBe(0)

    unmount(vnode, container)
    // Component VNode + rendered span VNode + text child VNode should be pooled
    expect(getPoolSize()).toBeGreaterThan(0)
  })

  it("should return fragment VNodes to the pool on unmount", () => {
    // h(null, ...) creates a fragment VNode
    const vnode = h(null, null, h("li", null, "one"), h("li", null, "two"))
    mount(vnode, container)
    expect(getPoolSize()).toBe(0)

    unmount(vnode, container)
    // Fragment VNode + 2x li VNodes + 2x text VNodes should be pooled
    expect(getPoolSize()).toBeGreaterThan(0)
  })

  it("should overwrite all properties when a pooled VNode is reacquired", () => {
    // Mount and unmount a VNode with key and className to put it in the pool
    const vnode = h("div", { key: "old", className: "old" }, "content")
    mount(vnode, container)
    unmount(vnode, container)

    expect(getPoolSize()).toBeGreaterThan(0)

    // Acquire from pool via h() -- the pooled VNode's key/className should be overwritten
    const reused = h("section", { key: "new", className: "new" })
    expect(reused.key).toBe("new")
    expect(reused.className).toBe("new")
    expect(reused.type).toBe("section")
    expect(reused.dom).toBeNull()
    expect(reused.parentDom).toBeNull()
  })
})
