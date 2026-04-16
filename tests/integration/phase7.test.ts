import { describe, expect, it, vi } from "vitest"
import { createRef, h, mount, patch, unmount } from "../../src/index"
import type { VNode } from "../../src/vnode"

describe("Phase 7 — refs, dangerouslySetInnerHTML, error handling", () => {
  let container: HTMLDivElement

  function setup(): HTMLDivElement {
    return document.createElement("div")
  }

  describe("refs", () => {
    it("should call callback ref after mount", () => {
      container = setup()
      const refFn = vi.fn()

      const vnode = h("div", { ref: refFn }, "hello")
      mount(vnode, container)

      expect(refFn).toHaveBeenCalledTimes(1)
      expect(refFn).toHaveBeenCalledWith(expect.any(HTMLDivElement))
    })

    it("should set object ref after mount", () => {
      container = setup()
      const ref = createRef()

      const vnode = h("div", { ref }, "hello")
      mount(vnode, container)

      expect(ref.current).toBeInstanceOf(HTMLDivElement)
    })

    it("should clear callback ref on unmount", () => {
      container = setup()
      const refFn = vi.fn()

      const vnode = h("div", { ref: refFn }, "hello")
      mount(vnode, container)
      refFn.mockClear()

      unmount(vnode, container)
      expect(refFn).toHaveBeenCalledWith(null)
    })

    it("should clear object ref on unmount", () => {
      container = setup()
      const ref = createRef()

      const vnode = h("div", { ref }, "hello")
      mount(vnode, container)
      expect(ref.current).not.toBeNull()

      unmount(vnode, container)
      expect(ref.current).toBeNull()
    })

    it("should update ref when it changes during patch", () => {
      container = setup()
      const ref1 = vi.fn()
      const ref2 = vi.fn()

      const old = h("div", { ref: ref1 }, "hello")
      mount(old, container)
      expect(ref1).toHaveBeenCalledTimes(1)

      const next = h("div", { ref: ref2 }, "hello")
      patch(old, next, container)

      // Old ref should be cleared
      expect(ref1).toHaveBeenCalledWith(null)
      // New ref should be set
      expect(ref2).toHaveBeenCalledWith(expect.any(HTMLDivElement))
    })
  })

  describe("dangerouslySetInnerHTML", () => {
    it("should set innerHTML on mount", () => {
      container = setup()
      const vnode = h("div", {
        dangerouslySetInnerHTML: { __html: "<strong>bold</strong>" },
      })
      mount(vnode, container)

      expect(container.innerHTML).toBe("<div><strong>bold</strong></div>")
    })

    it("should update innerHTML when it changes", () => {
      container = setup()
      const old = h("div", {
        dangerouslySetInnerHTML: { __html: "<em>italic</em>" },
      })
      mount(old, container)

      const next = h("div", {
        dangerouslySetInnerHTML: { __html: "<strong>bold</strong>" },
      })
      patch(old, next, container)

      expect(container.innerHTML).toBe("<div><strong>bold</strong></div>")
    })

    it("should not update innerHTML when unchanged", () => {
      container = setup()
      const htmlContent = "<span>same</span>"
      const old = h("div", {
        dangerouslySetInnerHTML: { __html: htmlContent },
      })
      mount(old, container)

      const dom = container.firstChild as HTMLElement
      const originalChild = dom.firstChild

      const next = h("div", {
        dangerouslySetInnerHTML: { __html: htmlContent },
      })
      patch(old, next, container)

      // DOM should not have been mutated
      expect(dom.firstChild).toBe(originalChild)
    })

    it("should transition from innerHTML to normal children", () => {
      container = setup()
      const old = h("div", {
        dangerouslySetInnerHTML: { __html: "<em>html</em>" },
      })
      mount(old, container)

      const next = h("div", null, "normal text")
      patch(old, next, container)

      expect(container.innerHTML).toBe("<div>normal text</div>")
    })
  })

  describe("error handling in components", () => {
    it("should catch errors in component render and show empty placeholder", () => {
      container = setup()

      function BrokenComp(): VNode {
        throw new Error("Component exploded!")
      }

      // Should not throw — error is caught internally
      mount(h(BrokenComp, null), container)

      // Should render an empty text node placeholder
      expect(container.childNodes.length).toBe(1)
      expect(container.childNodes[0]!.nodeType).toBe(3) // TEXT_NODE
    })

    it("should call onError prop when component throws", () => {
      container = setup()
      const onError = vi.fn()

      function BrokenComp(): VNode {
        throw new Error("oops")
      }

      mount(h(BrokenComp, { onError }), container)

      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenCalledWith(expect.any(Error))
    })

    it("should not break siblings when a component throws", () => {
      container = setup()

      function BrokenComp(): VNode {
        throw new Error("broken")
      }

      function GoodComp() {
        return h("span", null, "working")
      }

      // Mount a fragment with a broken and a good component
      const vnode = h(null, null, h(BrokenComp, null), h(GoodComp, null))
      mount(vnode, container)

      // The good component should still render
      expect(container.querySelector("span")?.textContent).toBe("working")
    })

    it("should not corrupt hook state after error", () => {
      container = setup()
      const onError = vi.fn()

      function BrokenComp(): VNode {
        throw new Error("error")
      }

      // This should not leave currentInstance in a bad state
      mount(h(BrokenComp, { onError }), container)

      // A subsequent component should work fine
      function GoodComp() {
        return h("div", null, "ok")
      }
      const container2 = setup()
      mount(h(GoodComp, null), container2)
      expect(container2.innerHTML).toBe("<div>ok</div>")
    })
  })

  describe("foreignObject SVG context", () => {
    it("should exit SVG context inside foreignObject", () => {
      container = setup()

      const vnode = h("svg", null, h("foreignObject", null, h("div", null, "html content")))
      mount(vnode, container)

      const svg = container.querySelector("svg")!
      expect(svg.namespaceURI).toBe("http://www.w3.org/2000/svg")

      const foreignObj = svg.querySelector("foreignObject")!
      expect(foreignObj.namespaceURI).toBe("http://www.w3.org/2000/svg")

      const div = foreignObj.querySelector("div")!
      // div inside foreignObject should be HTML, not SVG
      expect(div.namespaceURI).toBe("http://www.w3.org/1999/xhtml")
    })
  })
})
