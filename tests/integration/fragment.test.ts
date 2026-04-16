import { describe, expect, it, vi } from "vitest"
import { h, mount, patch, unmount, useEffect } from "../../src/index"
import type { VNode } from "../../src/vnode"

describe("fragment mounting and unmounting", () => {
  function setup(): HTMLDivElement {
    return document.createElement("div")
  }

  describe("mount", () => {
    it("should create a placeholder text node for an empty fragment", () => {
      const container = setup()
      const vnode = h(null, null)
      mount(vnode, container)

      // Empty fragment uses an empty text node as placeholder
      expect(container.childNodes.length).toBe(1)
      const node = container.childNodes[0]!
      expect(node.nodeType).toBe(Node.TEXT_NODE)
      expect((node as Text).nodeValue).toBe("")
      expect(vnode.dom).toBe(node)
    })

    it("should mount a single child fragment and set vnode.dom", () => {
      const container = setup()
      const vnode = h(null, null, h("span", null, "hello"))
      mount(vnode, container)

      const span = container.querySelector("span")
      expect(span).not.toBeNull()
      expect(span!.textContent).toBe("hello")
      expect(vnode.dom).toBe(span)
    })

    it("should mount a multi-child fragment with all children in DOM", () => {
      const container = setup()
      const vnode = h(null, null, h("span", null, "first"), h("div", null, "second"))
      mount(vnode, container)

      expect(container.childNodes.length).toBe(2)
      expect(container.childNodes[0]!.nodeName).toBe("SPAN")
      expect((container.childNodes[0] as HTMLElement).textContent).toBe("first")
      expect(container.childNodes[1]!.nodeName).toBe("DIV")
      expect((container.childNodes[1] as HTMLElement).textContent).toBe("second")
      // dom points to first child
      expect(vnode.dom).toBe(container.childNodes[0])
    })

    it("should mount a text child in a fragment as a text node", () => {
      const container = setup()
      const vnode = h(null, null, "hello")
      mount(vnode, container)

      expect(container.childNodes.length).toBe(1)
      expect(container.childNodes[0]!.nodeType).toBe(Node.TEXT_NODE)
      expect((container.childNodes[0] as Text).nodeValue).toBe("hello")
    })

    it("should mount nested fragments (fragment containing a fragment)", () => {
      const container = setup()
      const inner = h(null, null, h("em", null, "inner"))
      const outer = h(null, null, inner, h("span", null, "sibling"))
      mount(outer, container)

      const em = container.querySelector("em")
      const span = container.querySelector("span")
      expect(em).not.toBeNull()
      expect(em!.textContent).toBe("inner")
      expect(span).not.toBeNull()
      expect(span!.textContent).toBe("sibling")
    })
  })

  describe("unmount", () => {
    it("should remove the placeholder text node when unmounting an empty fragment", () => {
      const container = setup()
      const vnode = h(null, null)
      mount(vnode, container)
      expect(container.childNodes.length).toBe(1)

      unmount(vnode, container)
      expect(container.childNodes.length).toBe(0)
    })

    it("should remove the child when unmounting a single-child fragment", () => {
      const container = setup()
      const vnode = h(null, null, h("span", null, "bye"))
      mount(vnode, container)
      expect(container.querySelector("span")).not.toBeNull()

      unmount(vnode, container)
      expect(container.querySelector("span")).toBeNull()
      expect(container.childNodes.length).toBe(0)
    })

    it("should remove all children when unmounting a multi-child fragment", () => {
      const container = setup()
      const vnode = h(null, null, h("p", null, "one"), h("p", null, "two"), h("p", null, "three"))
      mount(vnode, container)
      expect(container.querySelectorAll("p").length).toBe(3)

      unmount(vnode, container)
      expect(container.querySelectorAll("p").length).toBe(0)
      expect(container.childNodes.length).toBe(0)
    })

    it("should run effect cleanup for a component inside a fragment that gets unmounted", () => {
      const container = setup()
      const cleanup = vi.fn()

      function Comp() {
        useEffect(() => cleanup, [])
        return h("span", null, "comp")
      }

      const vnode = h(null, null, h(Comp, null))
      mount(vnode, container)
      expect(cleanup).not.toHaveBeenCalled()

      unmount(vnode, container)
      expect(cleanup).toHaveBeenCalledTimes(1)
    })
  })

  describe("patch", () => {
    it("should add children when patching an empty fragment to a multi-child fragment", () => {
      const container = setup()
      const old = h(null, null)
      mount(old, container)

      const next = h(null, null, h("span", null, "a"), h("div", null, "b"))
      patch(old, next, container)

      expect(container.querySelector("span")).not.toBeNull()
      expect(container.querySelector("div")).not.toBeNull()
    })

    it("should remove children when patching a multi-child fragment to an empty fragment", () => {
      const container = setup()
      const old = h(null, null, h("span", null, "a"), h("span", null, "b"))
      mount(old, container)
      expect(container.querySelectorAll("span").length).toBe(2)

      const next = h(null, null)
      patch(old, next, container)
      expect(container.querySelectorAll("span").length).toBe(0)
    })

    it("should reorder fragment children", () => {
      const container = setup()
      const old = h(
        null,
        null,
        h("span", { key: "a" }, "A"),
        h("span", { key: "b" }, "B"),
        h("span", { key: "c" }, "C"),
      )
      mount(old, container)

      const old0 = container.childNodes[0]
      const old2 = container.childNodes[2]

      const next = h(
        null,
        null,
        h("span", { key: "c" }, "C"),
        h("span", { key: "b" }, "B"),
        h("span", { key: "a" }, "A"),
      )
      patch(old, next, container)

      const spans = container.querySelectorAll("span")
      expect(spans[0]!.textContent).toBe("C")
      expect(spans[1]!.textContent).toBe("B")
      expect(spans[2]!.textContent).toBe("A")

      // DOM nodes should be reused (moved, not recreated)
      expect(container.childNodes[0]).toBe(old2)
      expect(container.childNodes[2]).toBe(old0)
    })

    it("should update the dom reference after patch", () => {
      const container = setup()
      const old = h(null, null, h("span", null, "first"))
      mount(old, container)
      const oldDom = old.dom

      const next = h(null, null, h("div", null, "replaced"))
      patch(old, next, container)

      // dom should now point to the new first child
      expect(next.dom).toBe(container.firstChild)
      expect(next.dom).not.toBe(oldDom)
    })

    it("should update text content within fragment children", () => {
      const container = setup()
      const old = h(null, null, h("p", null, "old text"))
      mount(old, container)

      const next = h(null, null, h("p", null, "new text"))
      patch(old, next, container)

      expect(container.querySelector("p")!.textContent).toBe("new text")
    })
  })
})
