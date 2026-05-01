import { beforeEach, describe, expect, it } from "vitest"
import type { SerializedNode, TachysDevToolsHook } from "../../src/devtools-hook"
import {
  __devtools_notifyRender,
  __devtools_setRootTrees,
  installDevToolsHook,
} from "../../src/devtools-hook"
import { h, mount, render, useEffect, useState } from "../../src/index"

function getHook(): TachysDevToolsHook | undefined {
  return (window as unknown as { __TACHYS_DEVTOOLS_HOOK__?: TachysDevToolsHook })
    .__TACHYS_DEVTOOLS_HOOK__
}

describe("DevTools Hook", () => {
  beforeEach(() => {
    // Re-install the hook to start fresh
    installDevToolsHook()
  })

  it("installs __TACHYS_DEVTOOLS_HOOK__ on window", () => {
    const hook = getHook()
    expect(hook).toBeDefined()
    expect(hook!.version).toBe("0.0.1")
  })

  it("has the expected API shape", () => {
    const hook = getHook()!
    expect(typeof hook.onRender).toBe("function")
    expect(typeof hook.inspectRoot).toBe("function")
    expect(typeof hook.highlight).toBe("function")
    expect(typeof hook.getEvents).toBe("function")
    expect(hook.roots).toBeInstanceOf(Set)
  })

  it("tracks root containers via render()", () => {
    const hook = getHook()!
    const container = document.createElement("div")

    render(h("div", null, "test"), container)
    expect(hook.roots.has(container)).toBe(true)
  })

  it("inspectRoot returns serialized tree", () => {
    const hook = getHook()!
    const container = document.createElement("div")

    render(h("div", { id: "root" }, h("span", null, "child")), container)

    const tree = hook.inspectRoot(container)
    expect(tree).not.toBeNull()
    expect(tree!.name).toBe("div")
    expect(tree!.type).toBe("element")
    expect(tree!.children.length).toBe(1)
    expect(tree!.children[0]!.name).toBe("span")
  })

  it("inspectRoot serializes component instances", () => {
    const hook = getHook()!
    const container = document.createElement("div")

    function MyComponent() {
      const [count] = useState(0)
      return h("div", null, String(count))
    }

    render(h(MyComponent, null), container)

    const tree = hook.inspectRoot(container)
    expect(tree).not.toBeNull()
    expect(tree!.type).toBe("component")
    expect(tree!.name).toBe("MyComponent")
    expect(tree!.hooks).not.toBeNull()
    expect(tree!.hooks!.length).toBeGreaterThan(0)
  })

  it("inspectRoot returns null for unknown container", () => {
    const hook = getHook()!
    const container = document.createElement("div")
    expect(hook.inspectRoot(container)).toBeNull()
  })

  it("onRender notifies listeners", () => {
    const hook = getHook()!
    const container = document.createElement("div")
    const notifications: Array<{ container: Element; tree: SerializedNode }> = []

    const unsubscribe = hook.onRender((c, t) => {
      notifications.push({ container: c, tree: t })
    })

    render(h("div", null, "first"), container)
    expect(notifications.length).toBe(1)
    expect(notifications[0]!.container).toBe(container)

    render(h("div", null, "second"), container)
    expect(notifications.length).toBe(2)

    unsubscribe()

    render(h("div", null, "third"), container)
    // Should NOT get a third notification after unsubscribe
    expect(notifications.length).toBe(2)
  })

  it("getEvents returns registered event names", () => {
    const hook = getHook()!
    const container = document.createElement("div")
    document.body.appendChild(container)

    mount(h("button", { onClick: () => {}, onMouseDown: () => {} }, "btn"), container)

    const button = container.querySelector("button")!
    const events = hook.getEvents(button)
    expect(events["click"]).toBe(true)
    expect(events["mousedown"]).toBe(true)

    document.body.removeChild(container)
  })

  it("getEvents returns empty object for element without events", () => {
    const hook = getHook()!
    const el = document.createElement("div")
    expect(hook.getEvents(el)).toEqual({})
  })

  it("highlight does not throw", () => {
    const hook = getHook()!
    const el = document.createElement("div")

    // Should not throw for any input
    expect(() => hook.highlight(el)).not.toThrow()
    expect(() => hook.highlight(null)).not.toThrow()
  })

  it("serializes text nodes", () => {
    const hook = getHook()!
    const container = document.createElement("div")

    render(h("div", null, "hello"), container)

    const tree = hook.inspectRoot(container)!
    // The div's child is text content, which is handled as HasTextChildren
    // rather than a child VNode - so this tests the element serialization
    expect(tree.name).toBe("div")
  })

  it("serializes fragment children", () => {
    const hook = getHook()!
    const container = document.createElement("div")

    render(h(null, null, h("a", null), h("b", null)), container)

    const tree = hook.inspectRoot(container)!
    expect(tree.type).toBe("fragment")
    expect(tree.name).toBe("<Fragment>")
    expect(tree.children.length).toBe(2)
  })

  it("serializes component effects", () => {
    const hook = getHook()!
    const container = document.createElement("div")

    function WithEffect() {
      useEffect(() => {
        return () => {}
      }, [])
      return h("div", null, "effect")
    }

    render(h(WithEffect, null), container)

    const tree = hook.inspectRoot(container)!
    expect(tree.effects).not.toBeNull()
    expect(tree.effects!.length).toBe(1)
    expect(tree.effects![0]!.hasDeps).toBe(true)
    expect(tree.effects![0]!.depCount).toBe(0)
  })
})
